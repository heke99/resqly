import type { Coordinate } from "@resqly/types";
import type { AppSupabaseClient } from "@resqly/database";
import type { DispatchCandidate } from "./types";
import type {
  DispatchCandidateQuery,
  DispatchSettings,
  DispatchStore,
  JobStatusEventRow,
  OfferInsertRow,
} from "./orchestrator";
import { DEFAULT_DISPATCH_SETTINGS } from "./orchestrator";

/**
 * Supabase (service-role) backed DispatchStore used by the web apps. The
 * partner API keeps its own repository adapter so both entry points share the
 * exact same orchestration logic.
 */
export function createSupabaseDispatchStore(db: AppSupabaseClient): DispatchStore {
  return {
    async transitionJobStatus(event: JobStatusEventRow) {
      const { data, error } = await db.rpc("transition_tow_job_status" as never, {
        p_job: event.tow_job_id,
        p_expected_from: event.from_status,
        p_to_status: event.to_status,
        p_actor_user: event.actor_user_id ?? null,
        p_actor_api_client: event.actor_api_client_id ?? null,
        p_actor_worker: event.actor_worker ?? null,
        p_reason: event.reason ?? null,
      } as never);
      if (error) throw new Error(error.message);
      const result = (Array.isArray(data) ? data[0] : data) as { error?: string; actual?: string } | null;
      if (result?.error) throw new Error(`tow status transition failed: ${result.error}${result.actual ? ` (${result.actual})` : ""}`);
    },
    async getCandidates(pickup: Coordinate, radiusKm: number, limit: number, query: DispatchCandidateQuery) {
      const { data, error } = await db.rpc("dispatch_eligible_candidates" as never, {
        p_lat: pickup.lat,
        p_lng: pickup.lng,
        p_radius_m: radiusKm * 1000,
        p_limit: limit,
        p_payer_type: query.payerType,
        p_insurance_tenant_id: query.insuranceTenantId,
      } as never);
      if (error) throw new Error(error.message);
      const rows =
        (data as unknown as Array<{
          driver_id: string;
          tow_company_id: string;
          duty_status: string;
          is_online: boolean;
          is_busy: boolean;
          distance_m: number;
          driver_lat?: number | null;
          driver_lng?: number | null;
          tow_vehicle_id?: string | null;
          insurance_agreement_id?: string | null;
          agreement_priority?: number | null;
          marketplace_enabled?: boolean | null;
          can_handle_ev: boolean;
          has_flatbed: boolean;
          can_tow_heavy_truck: boolean;
          can_tow_motorcycle: boolean;
        }> | null) ?? [];
      return rows
        .filter((d) => typeof d.driver_id === "string" && typeof d.tow_company_id === "string")
        .map<DispatchCandidate>((d) => ({
          driverId: d.driver_id,
          towCompanyId: d.tow_company_id,
          towVehicleId: d.tow_vehicle_id ?? null,
          insuranceAgreementId: d.insurance_agreement_id ?? null,
          agreementPriority: d.agreement_priority ?? null,
          inPreferredNetwork: Boolean(d.insurance_agreement_id),
          marketplaceEnabled: Boolean(d.marketplace_enabled),
          dutyStatus: (d.duty_status as DispatchCandidate["dutyStatus"]) ?? "on_duty",
          distanceMeters: d.distance_m,
          location:
            d.driver_lat != null && d.driver_lng != null
              ? { lat: d.driver_lat, lng: d.driver_lng }
              : undefined,
          isOnline: d.is_online,
          isBusy: d.is_busy,
          capabilities: {
            canHandleEv: d.can_handle_ev,
            hasFlatbed: d.has_flatbed,
            canTowHeavy: d.can_tow_heavy_truck,
            canTowMotorcycle: d.can_tow_motorcycle,
          },
        }));
    },
    async createOffers(rows: OfferInsertRow[]) {
      const { error } = await db.from("tow_job_offers" as never).upsert(rows as never, {
        onConflict: "tow_job_id,driver_id",
      } as never);
      if (error) throw new Error(error.message);
    },
    async listDriverPushTokens(driverId) {
      const { data, error } = await db
        .from("driver_devices" as never)
        .select("expo_push_token")
        .eq("driver_id", driverId);
      if (error) throw new Error(error.message);
      return ((data as Array<{ expo_push_token: string }> | null) ?? []).map((d) => d.expo_push_token);
    },
    async markOfferPush(jobId, driverId, status, error) {
      const patch: Record<string, unknown> = { push_status: status };
      if (status === "sent") patch.push_sent_at = new Date().toISOString();
      if (error) patch.push_error = error;
      const { error: updateError } = await db
        .from("tow_job_offers" as never)
        .update(patch as never)
        .eq("tow_job_id", jobId)
        .eq("driver_id", driverId);
      if (updateError) throw new Error(updateError.message);
    },
    async escalateManualReview(row) {
      const { data, error } = await db.rpc("escalate_tow_job_manual_review" as never, {
        p_job: row.tow_job_id,
        p_tenant: row.tenant_id,
        p_actor_user: row.actor_user_id ?? null,
        p_reason: row.status_reason,
        p_review_reason: row.review_reason,
        p_assign_to: null,
        p_actor_worker: row.actor_worker ?? null,
        p_actor_api_client: row.actor_api_client_id ?? null,
      } as never);
      if (error) throw new Error(error.message);
      const result = (Array.isArray(data) ? data[0] : data) as { error?: string } | null;
      if (result?.error) throw new Error(`manual review escalation failed: ${result.error}`);
    },
    async recordAudit(row) {
      const { error } = await db.from("audit_logs" as never).insert(row as never);
      if (error) throw new Error(error.message);
    },
  };
}

/** Load a tenant's dispatch settings, merged with safe defaults. */
export async function loadDispatchSettings(
  db: AppSupabaseClient,
  tenantId: string,
): Promise<DispatchSettings> {
  const { data, error } = await db
    .from("tenant_settings" as never)
    .select(
      "default_dispatch_strategy, max_dispatch_radius_km, max_dispatch_candidates, max_insurance_broadcast_candidates, private_dispatch_wave_radius_km, offer_expiry_seconds, allow_marketplace_fallback",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data as Partial<DispatchSettings> | null) ?? {};
  const merged: Record<string, unknown> = { ...DEFAULT_DISPATCH_SETTINGS };
  for (const key of Object.keys(DEFAULT_DISPATCH_SETTINGS) as Array<keyof DispatchSettings>) {
    const value = row[key];
    if (value !== null && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged as unknown as DispatchSettings;
}
