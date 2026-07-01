import { dispatchRunInputSchema } from "@resqly/types";
import type { Coordinate, DispatchStrategy } from "@resqly/types";
import { notFound } from "@resqly/utils";
import { selectDispatch, type DispatchCandidate, type DispatchRequest } from "@resqly/dispatch";
import { MapsClient } from "@resqly/maps";
import { buildOfferPushMessage, sendExpoPush } from "@resqly/notifications";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import type { TowJobRecord } from "../repo/types";
import { enqueueWebhookEvent } from "../services/notifications";

export interface RunDispatchInput {
  job: TowJobRecord;
  pickup: Coordinate;
  payerType: "insurance_company" | "customer_private";
  priority: "normal" | "high" | "urgent";
  strategy?: DispatchStrategy;
  problemType?: string | null;
}

export interface RunDispatchOutcome {
  status: "offered" | "manual_review";
  offeredDrivers: string[];
  requiresManualReview: boolean;
  strategy: DispatchStrategy;
}

/**
 * Shared dispatch orchestration used by both incident request-tow and the
 * standalone /dispatch/run endpoint. Candidate eligibility (insurance agreement
 * vs marketplace) is enforced in the repo's getDispatchCandidates query, so any
 * candidate returned here is already eligible for this case.
 */
export async function runDispatchForJob(
  ctx: ApiContext,
  input: RunDispatchInput,
): Promise<RunDispatchOutcome> {
  const { job, pickup } = input;
  const settings = await ctx.repo.getTenantSettings(ctx.tenantId);

  await ctx.repo.setTowJobStatus(job.id, "matching");
  await ctx.repo.addTowJobStatusEvent({
    tow_job_id: job.id,
    from_status: job.status,
    to_status: "matching",
  });
  await enqueueWebhookEvent(ctx, "tow.dispatch_started", {
    tow_job_id: job.id,
    incident_id: job.incident_id,
    pickup,
  });

  const candidateLimit =
    input.payerType === "insurance_company"
      ? settings.max_insurance_broadcast_candidates
      : settings.max_dispatch_candidates;
  const rawCandidates = await ctx.repo.getDispatchCandidates(
    pickup,
    settings.max_dispatch_radius_km,
    candidateLimit,
    {
      payerType: input.payerType,
      insuranceTenantId: input.payerType === "insurance_company" ? job.tenant_id : null,
      broadcastAllContractVehicles: input.payerType === "insurance_company",
    },
  );
  const candidates = await enrichCandidatesWithGoogleEta(ctx, rawCandidates, pickup);

  const strategy = (input.strategy ?? settings.default_dispatch_strategy) as DispatchStrategy;
  const request: DispatchRequest = {
    strategy,
    payerType: input.payerType,
    priority: input.priority,
    requirements: input.problemType === "ev_out_of_battery" ? { needsEv: true } : undefined,
    // Insurance-funded jobs are contract-only and broadcast to all eligible
    // approved tow vehicles in range. Direct/private jobs are marketplace jobs
    // and are offered nearest/fastest outward, capped by max_dispatch_candidates.
    allowMarketplaceFallback: input.payerType === "customer_private" && settings.allow_marketplace_fallback,
    offerAllEligible: input.payerType === "insurance_company",
    maxCandidates: input.payerType === "insurance_company" ? candidateLimit : settings.max_dispatch_candidates,
    maxDistanceMeters: settings.max_dispatch_radius_km * 1000,
  };
  const dispatch = selectDispatch(candidates, request);

  if (dispatch.offers.length > 0) {
    const expiresAt = new Date(Date.now() + settings.offer_expiry_seconds * 1000).toISOString();
    await ctx.repo.createOffers(
      dispatch.offers.map((o) => ({
        tenant_id: ctx.tenantId,
        tow_job_id: job.id,
        driver_id: o.driverId,
        tow_company_id: o.towCompanyId,
        tow_vehicle_id: o.towVehicleId ?? null,
        rank: o.rank,
        distance_meters: o.distanceMeters,
        eta_seconds: o.etaSeconds ?? null,
        expires_at: expiresAt,
      })),
    );
    await ctx.repo.setTowJobStatus(job.id, "offered");
    await ctx.repo.addTowJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "offered",
    });
    await enqueueWebhookEvent(ctx, "tow.offered", {
      tow_job_id: job.id,
      incident_id: job.incident_id,
      offered_drivers: dispatch.offers.map((o) => o.driverId),
      offered_tow_vehicles: dispatch.offers.map((o) => o.towVehicleId).filter(Boolean),
    });
    await sendOfferPushes(ctx, job, dispatch.offers, pickup, input.problemType ?? null, expiresAt);
  } else {
    await ctx.repo.setTowJobStatus(job.id, "manual_review");
    await ctx.repo.addTowJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "manual_review",
    });
    await enqueueWebhookEvent(ctx, "tow.manual_review", {
      tow_job_id: job.id,
      incident_id: job.incident_id,
      reason: "no_eligible_driver",
    });
  }

  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: job.id,
    fields: ["strategy"],
    metadata: {
      strategy: dispatch.strategy,
      offers: dispatch.offers.length,
      contract_only: input.payerType === "insurance_company",
      offer_all_eligible: input.payerType === "insurance_company",
    },
  });

  return {
    status: dispatch.offers.length > 0 ? "offered" : "manual_review",
    offeredDrivers: dispatch.offers.map((o) => o.driverId),
    requiresManualReview: dispatch.requiresManualReview,
    strategy: dispatch.strategy,
  };
}

async function enrichCandidatesWithGoogleEta(
  ctx: ApiContext,
  candidates: DispatchCandidate[],
  pickup: Coordinate,
): Promise<DispatchCandidate[]> {
  const withLocation = candidates.filter((c) => c.location);
  if (withLocation.length === 0 || !ctx.config.maps.routesEnabled || !ctx.config.maps.serverKey) return candidates;

  const maps = new MapsClient({
    serverKey: ctx.config.maps.serverKey,
    routesEnabled: ctx.config.maps.routesEnabled,
    routeMatrixEnabled: ctx.config.maps.routeMatrixEnabled,
    tenantId: ctx.tenantId,
    onUsage: (usage) => {
      void ctx.repo.recordUsageEvent(ctx.tenantId, usage.kind, usage.count).catch(() => undefined);
    },
  });
  const matrix = await maps.calculateRouteMatrix(
    withLocation.map((c) => c.location!),
    [pickup],
  );
  const byDriver = new Map<string, DispatchCandidate>();
  withLocation.forEach((candidate, index) => {
    const eta = matrix[index]?.[0];
    if (!eta) return;
    byDriver.set(candidate.driverId, {
      ...candidate,
      distanceMeters: eta.distanceMeters,
      etaSeconds: eta.etaSeconds,
      etaSource: eta.source,
      etaDegraded: eta.degraded,
    });
  });
  return candidates.map((candidate) => byDriver.get(candidate.driverId) ?? candidate);
}

/**
 * Best-effort push to offered drivers. Failures are recorded on the offer
 * (push_status) and never abort dispatch. Payload contains no customer PII.
 */
async function sendOfferPushes(
  ctx: ApiContext,
  job: TowJobRecord,
  offers: Array<{ driverId: string; towCompanyId: string; towVehicleId?: string | null }>,
  pickup: Coordinate,
  problemType: string | null,
  expiresAt: string,
): Promise<void> {
  if (ctx.config.push?.enabled === false) return;
  const approxArea = `${pickup.lat.toFixed(1)}, ${pickup.lng.toFixed(1)}`;
  for (const o of offers) {
    try {
      const devices = await ctx.repo.listDriverDevices(o.driverId);
      if (devices.length === 0) {
        await ctx.repo.markOfferPush(job.id, o.driverId, "skipped");
        continue;
      }
      const messages = devices.map((d) =>
        buildOfferPushMessage({
          expoPushToken: d.expo_push_token,
          offerId: `${job.id}:${o.driverId}`,
          towJobId: job.id,
          approxArea,
          problemType: problemType ?? "assistance",
          expiresAt,
        }),
      );
      const res = await sendExpoPush(messages, {
        fetchImpl: ctx.config.push?.fetchImpl,
        url: ctx.config.push?.url,
      });
      await ctx.repo.markOfferPush(job.id, o.driverId, res.ok ? "sent" : "failed", res.error ?? null);
      await enqueueWebhookEvent(ctx, "tow.offer_sent", {
        tow_job_id: job.id,
        driver_id: o.driverId,
        tow_vehicle_id: o.towVehicleId ?? null,
        push_status: res.ok ? "sent" : "failed",
      });
    } catch (e) {
      await ctx.repo.markOfferPush(
        job.id,
        o.driverId,
        "failed",
        e instanceof Error ? e.message : "unknown",
      );
    }
  }
}

export async function runDispatch(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = dispatchRunInputSchema.parse(body);
  const job = await ctx.repo.getTowJob(ctx.tenantId, input.tow_job_id);
  if (!job) throw notFound("Tow job not found");
  const outcome = await runDispatchForJob(ctx, {
    job,
    pickup: input.pickup,
    payerType: input.payer_type,
    priority: input.priority,
    strategy: input.dispatch_strategy,
  });
  return {
    status: 200,
    body: {
      tow_job_id: job.id,
      status: outcome.status,
      offered_drivers: outcome.offeredDrivers,
      requires_manual_review: outcome.requiresManualReview,
      strategy: outcome.strategy,
    },
  };
}
