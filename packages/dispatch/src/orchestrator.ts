import type { Coordinate, DispatchStrategy } from "@resqly/types";
import { buildOfferPushMessage, sendExpoPush } from "@resqly/notifications";
import { selectDispatch } from "./engine";
import type { DispatchCandidate, DispatchOffer, DispatchRequest } from "./types";

/**
 * Shared server-side dispatch orchestration — the single source of truth used
 * by every entry point that starts towing dispatch (partner API request-tow,
 * customer app request-tow, admin re-dispatch). Persistence goes through the
 * DispatchStore so the partner API can reuse its repository (and its in-memory
 * test double) while web apps use the Supabase-backed store.
 */

export interface DispatchSettings {
  default_dispatch_strategy: string;
  max_dispatch_radius_km: number;
  max_dispatch_candidates: number;
  max_insurance_broadcast_candidates: number;
  /** First-wave radius for private/direct jobs. 0/undefined = single wave. */
  private_dispatch_wave_radius_km: number;
  offer_expiry_seconds: number;
  /**
   * Private jobs only: when the nearest wave has no eligible marketplace
   * vehicle, expand to the full dispatch radius. Insurance jobs never fall
   * back to the open marketplace (contract-only rule).
   */
  allow_marketplace_fallback: boolean;
}

export const DEFAULT_DISPATCH_SETTINGS: DispatchSettings = {
  default_dispatch_strategy: "eta_first",
  max_dispatch_radius_km: 50,
  max_dispatch_candidates: 8,
  max_insurance_broadcast_candidates: 250,
  private_dispatch_wave_radius_km: 15,
  offer_expiry_seconds: 120,
  allow_marketplace_fallback: true,
};

export interface DispatchCandidateQuery {
  payerType: "insurance_company" | "customer_private";
  insuranceTenantId: string | null;
}

export interface OfferInsertRow {
  tenant_id: string;
  tow_job_id: string;
  driver_id: string;
  tow_company_id: string;
  tow_vehicle_id: string | null;
  rank: number;
  distance_meters: number | null;
  eta_seconds: number | null;
  expires_at: string;
}

export interface JobStatusEventRow {
  tow_job_id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id?: string | null;
  reason?: string | null;
}

/** Persistence needed by the orchestrator; implemented by the partner API repo
 * adapter and by the Supabase store for the web apps. */
export interface DispatchStore {
  setJobStatus(jobId: string, status: string): Promise<void>;
  addJobStatusEvent(event: JobStatusEventRow): Promise<void>;
  getCandidates(
    pickup: Coordinate,
    radiusKm: number,
    limit: number,
    query: DispatchCandidateQuery,
  ): Promise<DispatchCandidate[]>;
  createOffers(rows: OfferInsertRow[]): Promise<void>;
  listDriverPushTokens(driverId: string): Promise<string[]>;
  markOfferPush(
    jobId: string,
    driverId: string,
    status: "sent" | "failed" | "skipped",
    error?: string | null,
  ): Promise<void>;
  createManualReview(row: {
    tenant_id: string;
    incident_id: string | null;
    tow_job_id: string;
    reason: string;
  }): Promise<void>;
  recordAudit(row: Record<string, unknown>): Promise<void>;
}

export interface OrchestrateDispatchInput {
  tenantId: string;
  job: { id: string; incident_id: string | null; status: string | null };
  pickup: Coordinate;
  payerType: "insurance_company" | "customer_private";
  priority: "normal" | "high" | "urgent";
  strategy?: DispatchStrategy;
  problemType?: string | null;
  caseNumber?: string | null;
  /** The user (customer) who triggered dispatch, for status events/audit. */
  actorUserId?: string | null;
  settings?: Partial<DispatchSettings> | null;
}

export interface OrchestrateDispatchHooks {
  /** Server-side ETA enrichment (Google Route Matrix). Optional. */
  enrichCandidates?: (
    candidates: DispatchCandidate[],
    pickup: Coordinate,
  ) => Promise<DispatchCandidate[]>;
  /** Outbound integration events (partner webhooks). Optional. */
  onEvent?: (event: string, payload: Record<string, unknown>) => Promise<void>;
  push?: { enabled?: boolean; url?: string; fetchImpl?: typeof fetch };
}

export interface OrchestrateDispatchOutcome {
  status: "offered" | "manual_review";
  offeredDrivers: string[];
  offeredTowVehicles: string[];
  requiresManualReview: boolean;
  strategy: DispatchStrategy;
  offers: DispatchOffer[];
}

export async function orchestrateDispatch(
  store: DispatchStore,
  input: OrchestrateDispatchInput,
  hooks: OrchestrateDispatchHooks = {},
): Promise<OrchestrateDispatchOutcome> {
  const settings: DispatchSettings = { ...DEFAULT_DISPATCH_SETTINGS, ...(input.settings ?? {}) };
  const { job, pickup, payerType } = input;
  const isInsurance = payerType === "insurance_company";

  await store.setJobStatus(job.id, "matching");
  await store.addJobStatusEvent({
    tow_job_id: job.id,
    from_status: job.status ?? null,
    to_status: "matching",
    actor_user_id: input.actorUserId ?? null,
    reason: isInsurance
      ? "kunden begärde bärgning; avtalade bärgare matchas"
      : "kunden begärde fri bärgning; marketplace matchas närmast först",
  });
  await hooks.onEvent?.("tow.dispatch_started", {
    tow_job_id: job.id,
    incident_id: job.incident_id,
    pickup,
  });

  const candidateLimit = isInsurance
    ? settings.max_insurance_broadcast_candidates
    : settings.max_dispatch_candidates;
  const rawCandidates = await store.getCandidates(pickup, settings.max_dispatch_radius_km, candidateLimit, {
    payerType,
    insuranceTenantId: isInsurance ? input.tenantId : null,
  });
  const candidates = hooks.enrichCandidates
    ? await hooks.enrichCandidates(rawCandidates, pickup)
    : rawCandidates;

  const strategy = (input.strategy ?? settings.default_dispatch_strategy) as DispatchStrategy;
  const request: DispatchRequest = {
    strategy,
    payerType,
    priority: input.priority,
    requirements: input.problemType === "ev_out_of_battery" ? { needsEv: true } : undefined,
    // Insurance-funded jobs are contract-only and broadcast to every eligible
    // approved tow vehicle in range; the first race-safe accept wins.
    offerAllEligible: isInsurance,
    maxCandidates: candidateLimit,
    maxDistanceMeters: settings.max_dispatch_radius_km * 1000,
  };

  let dispatch;
  let usedFallbackWave = false;
  if (!isInsurance) {
    // Private/direct jobs go out in waves: nearest wave first, and only when
    // it is empty (and the tenant allows it) the full radius is used.
    const waveRadiusKm =
      settings.private_dispatch_wave_radius_km > 0
        ? Math.min(settings.private_dispatch_wave_radius_km, settings.max_dispatch_radius_km)
        : settings.max_dispatch_radius_km;
    dispatch = selectDispatch(candidates, { ...request, maxDistanceMeters: waveRadiusKm * 1000 });
    if (
      dispatch.offers.length === 0 &&
      settings.allow_marketplace_fallback &&
      waveRadiusKm < settings.max_dispatch_radius_km
    ) {
      dispatch = selectDispatch(candidates, request);
      usedFallbackWave = dispatch.offers.length > 0;
    }
  } else {
    dispatch = selectDispatch(candidates, request);
  }

  if (dispatch.offers.length > 0) {
    const expiresAt = new Date(Date.now() + settings.offer_expiry_seconds * 1000).toISOString();
    await store.createOffers(
      dispatch.offers.map((o) => ({
        tenant_id: input.tenantId,
        tow_job_id: job.id,
        driver_id: o.driverId,
        tow_company_id: o.towCompanyId,
        tow_vehicle_id: o.towVehicleId ?? null,
        rank: o.rank,
        distance_meters: Number.isFinite(o.distanceMeters) ? o.distanceMeters : null,
        eta_seconds: o.etaSeconds ?? null,
        expires_at: expiresAt,
      })),
    );
    await store.setJobStatus(job.id, "offered");
    await store.addJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "offered",
      actor_user_id: input.actorUserId ?? null,
      reason: isInsurance
        ? "erbjudande skickat till alla behöriga avtalade bärgningsbilar i radie"
        : usedFallbackWave
          ? "erbjudande skickat till marketplace-bärgare i utökad radie"
          : "erbjudande skickat till närmaste marketplace-bärgare",
    });
    await hooks.onEvent?.("tow.offered", {
      tow_job_id: job.id,
      incident_id: job.incident_id,
      offered_drivers: dispatch.offers.map((o) => o.driverId),
      offered_tow_vehicles: dispatch.offers.map((o) => o.towVehicleId).filter(Boolean),
    });
    await sendOfferPushes(store, input, dispatch.offers, expiresAt, hooks);
  } else {
    await store.setJobStatus(job.id, "manual_review");
    await store.addJobStatusEvent({
      tow_job_id: job.id,
      from_status: "matching",
      to_status: "manual_review",
      actor_user_id: input.actorUserId ?? null,
      reason: isInsurance
        ? "ingen aktiv avtalad bärgare hittades inom radie"
        : "ingen aktiv marketplace-bärgare hittades inom radie",
    });
    await store.createManualReview({
      tenant_id: input.tenantId,
      incident_id: job.incident_id,
      tow_job_id: job.id,
      reason: isInsurance
        ? "Ingen behörig avtalad bärgare fanns tillgänglig i området."
        : "Ingen bärgare som tar emot privata uppdrag fanns tillgänglig i området.",
    });
    await hooks.onEvent?.("tow.manual_review", {
      tow_job_id: job.id,
      incident_id: job.incident_id,
      reason: "no_eligible_driver",
    });
  }

  await store.recordAudit({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId ?? null,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: job.id,
    fields: ["strategy"],
    metadata: {
      strategy: dispatch.strategy,
      offers: dispatch.offers.length,
      payer_type: payerType,
      contract_only: isInsurance,
      offer_all_eligible: isInsurance,
      used_fallback_wave: usedFallbackWave,
      case_number: input.caseNumber ?? null,
    },
  });

  return {
    status: dispatch.offers.length > 0 ? "offered" : "manual_review",
    offeredDrivers: dispatch.offers.map((o) => o.driverId),
    offeredTowVehicles: dispatch.offers.map((o) => o.towVehicleId).filter((v): v is string => Boolean(v)),
    requiresManualReview: dispatch.requiresManualReview,
    strategy: dispatch.strategy,
    offers: dispatch.offers,
  };
}

/**
 * Best-effort push to offered drivers. Failures are recorded on the offer
 * (push_status) and never abort dispatch. Payload contains no customer PII.
 */
async function sendOfferPushes(
  store: DispatchStore,
  input: OrchestrateDispatchInput,
  offers: DispatchOffer[],
  expiresAt: string,
  hooks: OrchestrateDispatchHooks,
): Promise<void> {
  if (hooks.push?.enabled === false) return;
  const approxArea = `${input.pickup.lat.toFixed(1)}, ${input.pickup.lng.toFixed(1)}`;
  for (const offer of offers) {
    try {
      const tokens = await store.listDriverPushTokens(offer.driverId);
      if (tokens.length === 0) {
        await store.markOfferPush(input.job.id, offer.driverId, "skipped");
        continue;
      }
      const messages = tokens.map((token) =>
        buildOfferPushMessage({
          expoPushToken: token,
          offerId: `${input.job.id}:${offer.driverId}`,
          towJobId: input.job.id,
          approxArea,
          problemType: input.problemType ?? "assistance",
          expiresAt,
        }),
      );
      const res = await sendExpoPush(messages, {
        fetchImpl: hooks.push?.fetchImpl,
        url: hooks.push?.url,
      });
      await store.markOfferPush(input.job.id, offer.driverId, res.ok ? "sent" : "failed", res.error ?? null);
      await hooks.onEvent?.("tow.offer_sent", {
        tow_job_id: input.job.id,
        driver_id: offer.driverId,
        tow_vehicle_id: offer.towVehicleId ?? null,
        push_status: res.ok ? "sent" : "failed",
      });
    } catch (e) {
      await store.markOfferPush(
        input.job.id,
        offer.driverId,
        "failed",
        e instanceof Error ? e.message : "unknown",
      );
    }
  }
}
