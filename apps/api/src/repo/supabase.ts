import { allocateCaseNumber, type AppSupabaseClient } from "@resqly/database";
import type { Coordinate, IncidentStatus, TowJobStatus } from "@resqly/types";
import type { DispatchCandidate } from "@resqly/dispatch";
import type {
  AcceptOfferResult,
  ApiClientRecord,
  ApiRepo,
  CustomerContact,
  DispatchCandidateOptions,
  DriverDeviceRecord,
  DriverProfileRecord,
  EtaSnapshotRecord,
  IncidentRecord,
  OfferRecord,
  RoleContext,
  RoleContextTenant,
  TenantRecord,
  TenantSettingsRecord,
  TowJobRecord,
} from "./types";

const DEFAULT_SETTINGS: TenantSettingsRecord = {
  default_dispatch_strategy: "eta_first",
  bankid_required_for_claims: true,
  bankid_required_for_tow: true,
  max_dispatch_radius_km: 50,
  max_dispatch_candidates: 8,
  offer_expiry_seconds: 120,
  allow_marketplace_fallback: true,
};

/** Production repository backed by Supabase (service-role client). */
export class SupabaseRepo implements ApiRepo {
  constructor(private readonly db: AppSupabaseClient) {}

  private table(name: string) {
    return this.db.from(name as never);
  }

  async findApiClientByKeyHash(hash: string): Promise<ApiClientRecord | null> {
    const { data } = await this.table("tenant_api_clients")
      .select("id, tenant_id, active")
      .eq("api_key_hash", hash)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; tenant_id: string; active: boolean };
    return { id: row.id, tenantId: row.tenant_id, active: row.active };
  }

  async logApiRequest(row: Record<string, unknown>): Promise<void> {
    await this.table("api_request_logs").insert(row as never);
  }
  async recordAudit(row: Record<string, unknown>): Promise<void> {
    await this.table("audit_logs").insert(row as never);
  }

  async getTenant(id: string): Promise<TenantRecord | null> {
    const { data } = await this.table("tenants")
      .select("id, slug, name, type, case_number_prefix")
      .eq("id", id)
      .maybeSingle();
    return (data as TenantRecord | null) ?? null;
  }

  async getTenantSettings(id: string): Promise<TenantSettingsRecord> {
    const { data } = await this.table("tenant_settings").select("*").eq("tenant_id", id).maybeSingle();
    return (data as TenantSettingsRecord | null) ?? { ...DEFAULT_SETTINGS };
  }
  async getTenantBranding(id: string) {
    const { data } = await this.table("tenant_branding").select("*").eq("tenant_id", id).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  async getTenantThemeTokens(id: string) {
    const { data } = await this.table("tenant_theme_tokens").select("*").eq("tenant_id", id).maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  }
  async updateTenantBranding(id: string, patch: Record<string, unknown>) {
    await this.table("tenant_branding").update(patch as never).eq("tenant_id", id);
  }
  async updateTenantSettings(id: string, patch: Record<string, unknown>) {
    await this.table("tenant_settings").update(patch as never).eq("tenant_id", id);
  }

  async allocateCaseNumber(tenantId: string, scope: string): Promise<string> {
    return allocateCaseNumber(this.db, tenantId, scope);
  }

  async createIncident(row: Record<string, unknown>): Promise<IncidentRecord> {
    const { data, error } = await this.table("incidents").insert(row as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as IncidentRecord;
  }
  async getIncident(tenantId: string, id: string): Promise<IncidentRecord | null> {
    const { data } = await this.table("incidents")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    return (data as IncidentRecord | null) ?? null;
  }
  async setIncidentStatus(id: string, status: IncidentStatus) {
    await this.table("incidents").update({ status } as never).eq("id", id);
  }
  async setIncidentBankidVerified(id: string) {
    await this.table("incidents")
      .update({ bankid_verified: true, status: "bankid_verified" } as never)
      .eq("id", id);
  }
  async addEvidence(row: Record<string, unknown>) {
    const { data, error } = await this.table("incident_evidence").insert(row as never).select("id").single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }
  async recordBankidSignature(row: Record<string, unknown>) {
    const { data, error } = await this.table("bankid_signatures").insert(row as never).select("id").single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }

  async getCustomerContact(incidentId: string): Promise<CustomerContact | null> {
    const { data: incident } = await this.table("incidents")
      .select("id, problem_type, description, customer_user_id, vehicle_id")
      .eq("id", incidentId)
      .maybeSingle();
    if (!incident) return null;
    const inc = incident as {
      problem_type: string | null;
      description: string | null;
      customer_user_id: string;
      vehicle_id: string | null;
    };
    const { data: profile } = await this.table("user_profiles")
      .select("full_name, phone, email")
      .eq("id", inc.customer_user_id)
      .maybeSingle();
    const { data: vehicle } = inc.vehicle_id
      ? await this.table("vehicles").select("registration_number").eq("id", inc.vehicle_id).maybeSingle()
      : { data: null };
    const { data: loc } = await this.table("incident_locations")
      .select("lat, lng, address")
      .eq("incident_id", incidentId)
      .eq("kind", "pickup")
      .maybeSingle();
    const p = (profile as { full_name?: string; phone?: string; email?: string } | null) ?? {};
    const l = (loc as { lat: number; lng: number; address: string | null } | null) ?? {
      lat: 0,
      lng: 0,
      address: null,
    };
    return {
      name: p.full_name ?? "",
      phone: p.phone ?? "",
      email: p.email ?? null,
      registration_number: (vehicle as { registration_number?: string } | null)?.registration_number ?? "",
      problem_summary: inc.problem_type ?? inc.description ?? "",
      pickup: { lat: l.lat, lng: l.lng },
      pickup_address: l.address,
      destination_address: null,
      customer_notes: inc.description,
    };
  }

  async createTowJob(row: Record<string, unknown>): Promise<TowJobRecord> {
    const { data, error } = await this.table("tow_jobs").insert(row as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as TowJobRecord;
  }
  async getTowJob(tenantId: string, id: string): Promise<TowJobRecord | null> {
    const { data } = await this.table("tow_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    return (data as TowJobRecord | null) ?? null;
  }
  async listTowJobs(tenantId: string, opts: { status?: string; limit: number }) {
    let q = this.table("tow_jobs").select("*").eq("tenant_id", tenantId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.limit(opts.limit);
    return (data as TowJobRecord[] | null) ?? [];
  }
  async setTowJobStatus(id: string, status: TowJobStatus) {
    await this.table("tow_jobs").update({ status } as never).eq("id", id);
  }
  async addTowJobStatusEvent(row: Record<string, unknown>) {
    await this.table("tow_job_status_events").insert(row as never);
  }
  async assignTowJob(id: string, driverId: string, towCompanyId: string) {
    await this.table("tow_jobs")
      .update({ driver_id: driverId, tow_company_id: towCompanyId } as never)
      .eq("id", id);
    await this.table("tow_job_assignments").insert({
      tow_job_id: id,
      driver_id: driverId,
      tow_company_id: towCompanyId,
    } as never);
  }
  async createOffers(rows: Array<Record<string, unknown>>) {
    await this.table("tow_job_offers").insert(rows as never);
  }
  async getOfferForDriver(jobId: string, driverId: string) {
    const { data } = await this.table("tow_job_offers")
      .select("status")
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId)
      .maybeSingle();
    return (data as { status: string } | null) ?? null;
  }
  async setOfferStatus(jobId: string, driverId: string, status: string) {
    await this.table("tow_job_offers")
      .update({ status } as never)
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId);
  }

  async getDispatchCandidates(
    pickup: Coordinate,
    radiusKm: number,
    limit: number,
    opts: DispatchCandidateOptions,
  ): Promise<DispatchCandidate[]> {
    const { data, error } = await this.db.rpc("dispatch_eligible_candidates" as never, {
      p_lat: pickup.lat,
      p_lng: pickup.lng,
      p_radius_m: radiusKm * 1000,
      p_limit: limit,
      p_payer_type: opts.payerType,
      p_insurance_tenant_id: opts.insuranceTenantId ?? null,
    } as never);
    if (error) throw new Error(error.message);
    const rows =
      (data as Array<{
        driver_id: string;
        tow_company_id: string;
        duty_status: string;
        is_online: boolean;
        is_busy: boolean;
        distance_m: number;
        can_handle_ev: boolean;
        has_flatbed: boolean;
        can_tow_heavy_truck: boolean;
        can_tow_motorcycle: boolean;
      }> | null) ?? [];
    return rows.map((d) => ({
      driverId: d.driver_id,
      towCompanyId: d.tow_company_id,
      dutyStatus: (d.duty_status as DispatchCandidate["dutyStatus"]) ?? "on_duty",
      distanceMeters: d.distance_m,
      isOnline: d.is_online,
      isBusy: d.is_busy,
      capabilities: {
        canHandleEv: d.can_handle_ev,
        hasFlatbed: d.has_flatbed,
        canTowHeavy: d.can_tow_heavy_truck,
        canTowMotorcycle: d.can_tow_motorcycle,
      },
    }));
  }

  async acceptOffer(jobId: string, driverId: string): Promise<AcceptOfferResult> {
    const { data, error } = await this.db.rpc("accept_tow_offer" as never, {
      p_job: jobId,
      p_driver: driverId,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return {
      accepted: Boolean(row?.accepted),
      towCompanyId: (row?.tow_company_id as string | null) ?? null,
      reason: (row?.reason as string | null) ?? null,
    };
  }

  async getOfferById(id: string): Promise<OfferRecord | null> {
    const { data } = await this.table("tow_job_offers")
      .select("id, tow_job_id, driver_id, tow_company_id, tenant_id, status, rank, expires_at")
      .eq("id", id)
      .maybeSingle();
    return (data as OfferRecord | null) ?? null;
  }

  async rejectOffer(jobId: string, driverId: string, reason: string | null): Promise<void> {
    await this.table("tow_job_offers")
      .update({ status: "rejected", rejected_at: new Date().toISOString(), rejection_reason: reason } as never)
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId);
  }

  async getDriverProfile(driverId: string): Promise<DriverProfileRecord | null> {
    const { data } = await this.table("tow_drivers")
      .select("id, tenant_id, tow_company_id, user_id, full_name, is_online, status, duty_status")
      .eq("id", driverId)
      .maybeSingle();
    return (data as DriverProfileRecord | null) ?? null;
  }

  async setDriverOnline(driverId: string, online: boolean): Promise<void> {
    await this.table("tow_drivers")
      .update({
        is_online: online,
        duty_status: online ? "on_duty" : "off_duty",
        last_seen_at: new Date().toISOString(),
      } as never)
      .eq("id", driverId);
  }

  async updateDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
    await this.table("tow_drivers")
      .update({ last_lat: lat, last_lng: lng, last_seen_at: new Date().toISOString() } as never)
      .eq("id", driverId);
  }

  async upsertDriverDevice(
    driverId: string,
    userId: string,
    device: { expo_push_token: string; platform: string; device_name?: string | null },
  ): Promise<void> {
    await this.table("driver_devices").upsert(
      {
        driver_id: driverId,
        user_id: userId,
        expo_push_token: device.expo_push_token,
        platform: device.platform,
        device_name: device.device_name ?? null,
        last_active_at: new Date().toISOString(),
      } as never,
      { onConflict: "expo_push_token" } as never,
    );
  }

  async listDriverOffers(driverId: string) {
    const { data } = await this.table("tow_job_offers")
      .select("id, tow_job_id, status, rank, expires_at")
      .eq("driver_id", driverId)
      .eq("status", "pending")
      .order("rank", { ascending: true });
    const offers = (data as Array<{ id: string; tow_job_id: string; status: string; rank: number; expires_at: string }> | null) ?? [];
    const result = [] as Awaited<ReturnType<ApiRepo["listDriverOffers"]>>;
    for (const o of offers) {
      const { data: job } = await this.table("tow_jobs")
        .select("priority, payer_type, incident_id")
        .eq("id", o.tow_job_id)
        .maybeSingle();
      const j = job as { priority: string; payer_type: string; incident_id: string } | null;
      let problemType: string | null = null;
      let approxArea: string | null = null;
      if (j) {
        const { data: inc } = await this.table("incidents")
          .select("problem_type")
          .eq("id", j.incident_id)
          .maybeSingle();
        problemType = (inc as { problem_type: string | null } | null)?.problem_type ?? null;
        const { data: loc } = await this.table("incident_locations")
          .select("lat, lng")
          .eq("incident_id", j.incident_id)
          .eq("kind", "pickup")
          .maybeSingle();
        const l = loc as { lat: number; lng: number } | null;
        approxArea = l ? `${l.lat.toFixed(1)}, ${l.lng.toFixed(1)}` : null;
      }
      result.push({
        offer_id: o.id,
        tow_job_id: o.tow_job_id,
        status: o.status,
        rank: o.rank,
        expires_at: o.expires_at,
        priority: j?.priority ?? "normal",
        payer_type: j?.payer_type ?? "insurance_company",
        problem_type: problemType,
        approx_area: approxArea,
        distance_meters: null,
      });
    }
    return result;
  }

  async listDriverDevices(driverId: string): Promise<DriverDeviceRecord[]> {
    const { data } = await this.table("driver_devices")
      .select("expo_push_token, platform")
      .eq("driver_id", driverId);
    return (data as DriverDeviceRecord[] | null) ?? [];
  }

  async markOfferPush(jobId: string, driverId: string, status: string, error?: string | null): Promise<void> {
    const patch: Record<string, unknown> = { push_status: status };
    if (status === "sent") patch.push_sent_at = new Date().toISOString();
    if (error) patch.push_error = error;
    await this.table("tow_job_offers").update(patch as never).eq("tow_job_id", jobId).eq("driver_id", driverId);
  }

  async loadRoleContext(userId: string): Promise<RoleContext | null> {
    const { data: profile } = await this.table("user_profiles")
      .select("id, email, full_name, is_platform_admin")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return null;
    const p = profile as { id: string; email: string | null; full_name: string | null; is_platform_admin: boolean };

    const { data: memberships } = await this.table("tenant_users")
      .select("tenant_id, status")
      .eq("user_id", userId)
      .eq("status", "active");
    const tenantIds = ((memberships as Array<{ tenant_id: string }> | null) ?? []).map((m) => m.tenant_id);

    const tenants: RoleContextTenant[] = [];
    for (const tid of tenantIds) {
      const { data: t } = await this.table("tenants").select("id, type, name").eq("id", tid).maybeSingle();
      const tt = t as { id: string; type: string; name: string } | null;
      if (!tt) continue;
      const { data: roleRows } = await this.table("user_roles")
        .select("role_key")
        .eq("user_id", userId)
        .eq("tenant_id", tid);
      const roles = ((roleRows as Array<{ role_key: string }> | null) ?? []).map((r) => r.role_key);
      tenants.push({ tenant_id: tt.id, tenant_type: tt.type, tenant_name: tt.name, roles });
    }

    const { data: driverRow } = await this.table("tow_drivers")
      .select("id, tow_company_id, is_online, status")
      .eq("user_id", userId)
      .maybeSingle();
    const driver = driverRow
      ? {
          driver_id: (driverRow as { id: string }).id,
          tow_company_id: (driverRow as { tow_company_id: string }).tow_company_id,
          is_online: (driverRow as { is_online: boolean }).is_online,
          status: (driverRow as { status: string }).status,
        }
      : null;

    const { count: vehicleCount } = await this.table("vehicles")
      .select("id", { count: "exact", head: true } as never)
      .eq("owner_user_id", userId);
    const { count: incidentCount } = await this.table("incidents")
      .select("id", { count: "exact", head: true } as never)
      .eq("customer_user_id", userId);
    const isCustomer = (vehicleCount ?? 0) > 0 || (incidentCount ?? 0) > 0;

    const insuranceAdmin = tenants.some((t) => t.tenant_type === "insurance_company");
    const towAdmin = tenants.some((t) => t.tenant_type === "tow_company");

    return {
      user_id: p.id,
      email: p.email,
      full_name: p.full_name,
      is_platform_admin: p.is_platform_admin,
      is_customer: isCustomer,
      driver,
      tenants,
      capabilities: {
        customer: isCustomer,
        driver: driver != null,
        insurance_admin: insuranceAdmin,
        tow_admin: towAdmin,
        tenant_user: tenants.length > 0,
        superadmin: p.is_platform_admin,
      },
    };
  }

  async createCustomerShare(row: Record<string, unknown>) {
    await this.table("tow_job_customer_shares").insert(row as never);
  }

  async addEtaSnapshot(row: Record<string, unknown>) {
    await this.table("tow_job_eta_snapshots").insert(row as never);
  }
  async getLatestEta(jobId: string): Promise<EtaSnapshotRecord | null> {
    const { data } = await this.table("tow_job_eta_snapshots")
      .select("*")
      .eq("tow_job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return (data as EtaSnapshotRecord | null) ?? null;
  }

  async createCompletionReport(row: Record<string, unknown>) {
    await this.table("tow_job_completion_reports").insert(row as never);
  }
  async createInvoice(row: Record<string, unknown>) {
    await this.table("tow_job_invoices").insert(row as never);
  }
  async getDriverIdForUser(userId: string): Promise<string | null> {
    const { data } = await this.table("tow_drivers").select("id").eq("user_id", userId).maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }
}
