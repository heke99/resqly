import { allocateCaseNumber, type AppSupabaseClient } from "@resqly/database";
import { findDriversWithinRadius } from "@resqly/geodata";
import type { Coordinate, IncidentStatus, TowJobStatus } from "@resqly/types";
import type { DispatchCandidate } from "@resqly/dispatch";
import type {
  ApiClientRecord,
  ApiRepo,
  CustomerContact,
  EtaSnapshotRecord,
  IncidentRecord,
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
  ): Promise<DispatchCandidate[]> {
    const drivers = await findDriversWithinRadius(this.db, pickup, radiusKm, limit);
    return drivers.map((d) => ({
      driverId: d.driverId,
      towCompanyId: d.towCompanyId,
      dutyStatus: "on_duty" as const,
      distanceMeters: d.distanceMeters,
    }));
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
