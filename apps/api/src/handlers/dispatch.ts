import { dispatchRunInputSchema } from "@resqly/types";
import type { Coordinate, DispatchStrategy } from "@resqly/types";
import { notFound } from "@resqly/utils";
import {
  orchestrateDispatch,
  type DispatchCandidate,
  type DispatchStore,
  type OrchestrateDispatchOutcome,
} from "@resqly/dispatch";
import { MapsClient } from "@resqly/maps";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import type { TowJobRecord } from "../repo/types";
import { enqueueWebhookEvent } from "../services/notifications";
import { apiActorFields } from "../services/audit";

export interface RunDispatchInput {
  job: TowJobRecord;
  pickup: Coordinate;
  payerType: "insurance_company" | "customer_private";
  priority: "normal" | "high" | "urgent";
  strategy?: DispatchStrategy;
  problemType?: string | null;
  actorUserId?: string | null;
  actorApiClientId?: string | null;
}

export type RunDispatchOutcome = OrchestrateDispatchOutcome;

/** Adapts the API repository to the shared orchestrator's store interface. */
function dispatchStoreFromRepo(ctx: ApiContext): DispatchStore {
  return {
    transitionJobStatus: (event) => ctx.repo.transitionTowJobStatus(event),
    getCandidates: (pickup, radiusKm, limit, query) =>
      ctx.repo.getDispatchCandidates(pickup, radiusKm, limit, {
        payerType: query.payerType,
        insuranceTenantId: query.insuranceTenantId,
        broadcastAllContractVehicles: query.payerType === "insurance_company",
      }),
    createOffers: (rows) => ctx.repo.createOffers(rows as unknown as Array<Record<string, unknown>>),
    listDriverPushTokens: async (driverId) =>
      (await ctx.repo.listDriverDevices(driverId)).map((d) => d.expo_push_token),
    markOfferPush: (jobId, driverId, status, error) => ctx.repo.markOfferPush(jobId, driverId, status, error),
    escalateManualReview: (row) => ctx.repo.escalateTowJobManualReview(row),
    recordAudit: (row) =>
      ctx.repo.recordAudit({
        ...row,
        ...apiActorFields(ctx),
      }),
  };
}

/**
 * Dispatch entry point used by both incident request-tow and the standalone
 * /dispatch/run endpoint. All orchestration lives in @resqly/dispatch
 * (orchestrateDispatch) — this wrapper only wires the repo, Google ETA
 * enrichment, partner webhooks and push configuration.
 */
export async function runDispatchForJob(
  ctx: ApiContext,
  input: RunDispatchInput,
): Promise<RunDispatchOutcome> {
  const settings = await ctx.repo.getTenantSettings(ctx.tenantId);
  return orchestrateDispatch(
    dispatchStoreFromRepo(ctx),
    {
      tenantId: ctx.tenantId,
      job: { id: input.job.id, incident_id: input.job.incident_id, status: input.job.status },
      pickup: input.pickup,
      payerType: input.payerType,
      priority: input.priority,
      strategy: input.strategy,
      problemType: input.problemType ?? null,
      caseNumber: null,
      actorUserId: input.actorUserId ?? ctx.userId ?? null,
      actorApiClientId:
        input.actorApiClientId ??
        (!ctx.userId && ctx.apiClientId && !["public", "user-token"].includes(ctx.apiClientId)
          ? ctx.apiClientId
          : null),
      settings,
    },
    {
      enrichCandidates: (candidates, pickup) => enrichCandidatesWithGoogleEta(ctx, candidates, pickup),
      onEvent: (event, payload) => enqueueWebhookEvent(ctx, event, payload),
      push: {
        enabled: ctx.config.push?.enabled !== false,
        url: ctx.config.push?.url,
        fetchImpl: ctx.config.push?.fetchImpl,
      },
    },
  );
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

export async function runDispatch(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = dispatchRunInputSchema.parse(body);
  const job = await ctx.repo.getTowJob(ctx.tenantId, input.tow_job_id);
  if (!job) throw notFound("Tow job not found");
  let pickup = (await ctx.repo.getIncidentCoordinates(job.incident_id)).pickup;
  if (!pickup) {
    await ctx.repo.upsertIncidentLocation({
      incident_id: job.incident_id,
      kind: "pickup",
      lat: input.pickup.lat,
      lng: input.pickup.lng,
    });
    pickup = input.pickup;
  }
  const outcome = await runDispatchForJob(ctx, {
    job,
    pickup,
    payerType: job.payer_type === "customer_private" ? "customer_private" : "insurance_company",
    priority: (["normal", "high", "urgent"].includes(job.priority) ? job.priority : "normal") as
      | "normal"
      | "high"
      | "urgent",
    strategy: input.dispatch_strategy,
    actorUserId: ctx.userId ?? null,
    actorApiClientId:
      !ctx.userId && ctx.apiClientId && !["public", "user-token"].includes(ctx.apiClientId)
        ? ctx.apiClientId
        : null,
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
