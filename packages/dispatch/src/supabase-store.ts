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
    async setJobStatus(jobId, status) {
      const { error } = await db.from("tow_jobs" as never).update({ status } as never).eq("id", jobId);
      if (error) throw new Error(error.message);
    },
    async addJobStatusEvent(event: JobStatusEventRow) {
      const { error } = await db.from("tow_job_status_events" as never).insert(event as never);
      if (error) throw new Error(error.message);
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
        ignoreDuplicates: true,
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
    async createManualReview(row) {
      const { data: existing, error: lookupError } = await db
        .from("manual_reviews" as never)
        .select("id")
        .eq("tow_job_id", row.tow_job_id)
        .in("status", ["open", "in_progress"] as never)
        .limit(1)
        .maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (existing) return;

      const { error } = await db
        .from("manual_reviews" as never)
        .insert({ ...row, status: "open" } as never);
      // Concurrent dispatch retries can race after the lookup. The partial
      // unique index in 0026 makes one insert win; the other is already safe.
      if (error && error.code !== "23505") throw new Error(error.message);
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
  const { data } = await db
    .from("tenant_settings" as never)
    .select(
      "default_dispatch_strategy, max_dispatch_radius_km, max_dispatch_candidates, max_insurance_broadcast_candidates, private_dispatch_wave_radius_km, offer_expiry_seconds, allow_marketplace_fallback",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();
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
