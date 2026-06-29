import { dispatchRunInputSchema } from "@resqly/types";
import type { Coordinate, DispatchStrategy } from "@resqly/types";
import { notFound } from "@resqly/utils";
import { selectDispatch, type DispatchRequest } from "@resqly/dispatch";
import { buildOfferPushMessage, sendExpoPush } from "@resqly/notifications";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import type { TowJobRecord } from "../repo/types";

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

  const candidates = await ctx.repo.getDispatchCandidates(
    pickup,
    settings.max_dispatch_radius_km,
    settings.max_dispatch_candidates,
    {
      payerType: input.payerType,
      insuranceTenantId: input.payerType === "insurance_company" ? job.tenant_id : null,
    },
  );

  const strategy = (input.strategy ?? settings.default_dispatch_strategy) as DispatchStrategy;
  const request: DispatchRequest = {
    strategy,
    payerType: input.payerType,
    priority: input.priority,
    requirements: input.problemType === "ev_out_of_battery" ? { needsEv: true } : undefined,
    allowMarketplaceFallback: settings.allow_marketplace_fallback,
    maxCandidates: settings.max_dispatch_candidates,
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
        rank: o.rank,
        expires_at: expiresAt,
      })),
    );
    await ctx.repo.setTowJobStatus(job.id, "offered");
    await ctx.repo.addTowJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "offered",
    });
    await sendOfferPushes(ctx, job, dispatch.offers, pickup, input.problemType ?? null, expiresAt);
  } else {
    await ctx.repo.setTowJobStatus(job.id, "manual_review");
    await ctx.repo.addTowJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "manual_review",
    });
  }

  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: job.id,
    fields: ["strategy"],
    metadata: { strategy: dispatch.strategy, offers: dispatch.offers.length },
  });

  return {
    status: dispatch.offers.length > 0 ? "offered" : "manual_review",
    offeredDrivers: dispatch.offers.map((o) => o.driverId),
    requiresManualReview: dispatch.requiresManualReview,
    strategy: dispatch.strategy,
  };
}

/**
 * Best-effort push to offered drivers. Failures are recorded on the offer
 * (push_status) and never abort dispatch. Payload contains no customer PII.
 */
async function sendOfferPushes(
  ctx: ApiContext,
  job: TowJobRecord,
  offers: Array<{ driverId: string; towCompanyId: string }>,
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
