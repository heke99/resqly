import { newId } from "@resqly/utils";
import { formatCaseNumber } from "@resqly/utils";
import type { DispatchCandidate } from "@resqly/dispatch";
import type {
  AcceptOfferResult,
  ApiClientRecord,
  ApiRepo,
  CustomerContact,
  DriverDeviceRecord,
  DriverProfileRecord,
  EtaSnapshotRecord,
  IncidentRecord,
  OfferRecord,
  RoleContext,
  TenantRecord,
  TenantSettingsRecord,
  TowJobRecord,
} from "./types";
import type { IncidentStatus, TowJobStatus } from "@resqly/types";

interface MemoryOffer {
  id: string;
  tow_job_id: string;
  driver_id: string;
  tow_company_id: string | null;
  tenant_id: string | null;
  status: string;
  rank: number;
  expires_at: string;
  push_status: string;
  rejection_reason?: string | null;
}

const DEFAULT_SETTINGS: TenantSettingsRecord = {
  default_dispatch_strategy: "eta_first",
  bankid_required_for_claims: true,
  bankid_required_for_tow: true,
  max_dispatch_radius_km: 50,
  max_dispatch_candidates: 8,
  offer_expiry_seconds: 120,
  allow_marketplace_fallback: true,
};

/** In-memory implementation used by tests. Mirrors the Supabase repo behaviour. */
export class MemoryRepo implements ApiRepo {
  apiClients = new Map<string, ApiClientRecord>(); // keyed by key hash
  tenants = new Map<string, TenantRecord>();
  settings = new Map<string, TenantSettingsRecord>();
  branding = new Map<string, Record<string, unknown>>();
  themeTokens = new Map<string, Record<string, unknown>>();
  incidents = new Map<string, IncidentRecord>();
  contacts = new Map<string, CustomerContact>(); // keyed by incident id
  towJobs = new Map<string, TowJobRecord>();
  offers: MemoryOffer[] = [];
  customerShares: Array<Record<string, unknown>> = [];
  etaSnapshots: EtaSnapshotRecord[] = [];
  completionReports: Array<Record<string, unknown>> = [];
  invoices: Array<Record<string, unknown>> = [];
  auditLogs: Array<Record<string, unknown>> = [];
  apiRequestLogs: Array<Record<string, unknown>> = [];
  candidates: DispatchCandidate[] = [];
  driverUsers = new Map<string, string>(); // userId -> driverId
  driverProfiles = new Map<string, DriverProfileRecord>(); // driverId -> profile
  devices: Array<{ driver_id: string; user_id: string; expo_push_token: string; platform: string }> = [];
  roleContexts = new Map<string, RoleContext>(); // userId -> context
  private seq = new Map<string, number>();

  // --- test fixtures (not part of ApiRepo) ---
  seedTenant(t: Partial<TenantRecord> & { id: string; case_number_prefix: string }): TenantRecord {
    const rec: TenantRecord = {
      id: t.id,
      slug: t.slug ?? t.id,
      name: t.name ?? t.id,
      type: t.type ?? "insurance_company",
      case_number_prefix: t.case_number_prefix,
    };
    this.tenants.set(rec.id, rec);
    this.settings.set(rec.id, { ...DEFAULT_SETTINGS });
    return rec;
  }
  seedApiClient(tenantId: string, keyHash: string): ApiClientRecord {
    const rec = { id: newId(), tenantId, active: true };
    this.apiClients.set(keyHash, rec);
    return rec;
  }
  seedContact(incidentId: string, contact: CustomerContact) {
    this.contacts.set(incidentId, contact);
  }
  seedDriverProfile(p: Partial<DriverProfileRecord> & { id: string }): DriverProfileRecord {
    const rec: DriverProfileRecord = {
      id: p.id,
      tenant_id: p.tenant_id ?? "tc-tenant",
      tow_company_id: p.tow_company_id ?? "tc1",
      user_id: p.user_id ?? null,
      full_name: p.full_name ?? "Driver",
      is_online: p.is_online ?? false,
      status: p.status ?? "active",
      duty_status: p.duty_status ?? "off_duty",
    };
    this.driverProfiles.set(rec.id, rec);
    if (rec.user_id) this.driverUsers.set(rec.user_id, rec.id);
    return rec;
  }
  seedRoleContext(ctx: RoleContext) {
    this.roleContexts.set(ctx.user_id, ctx);
  }

  // --- ApiRepo ---
  async findApiClientByKeyHash(hash: string) {
    return this.apiClients.get(hash) ?? null;
  }
  async logApiRequest(row: Record<string, unknown>) {
    this.apiRequestLogs.push(row);
  }
  async recordAudit(row: Record<string, unknown>) {
    this.auditLogs.push(row);
  }
  async getTenant(id: string) {
    return this.tenants.get(id) ?? null;
  }
  async getTenantSettings(id: string) {
    return this.settings.get(id) ?? { ...DEFAULT_SETTINGS };
  }
  async getTenantBranding(id: string) {
    return this.branding.get(id) ?? null;
  }
  async getTenantThemeTokens(id: string) {
    return this.themeTokens.get(id) ?? null;
  }
  async updateTenantBranding(id: string, patch: Record<string, unknown>) {
    this.branding.set(id, { ...(this.branding.get(id) ?? {}), ...patch });
  }
  async updateTenantSettings(id: string, patch: Record<string, unknown>) {
    this.settings.set(id, { ...(this.settings.get(id) ?? DEFAULT_SETTINGS), ...patch } as TenantSettingsRecord);
  }
  async allocateCaseNumber(tenantId: string, scope: string) {
    const tenant = this.tenants.get(tenantId)!;
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}:${scope}`;
    const next = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, next);
    return formatCaseNumber({ prefix: tenant.case_number_prefix, year, sequence: next });
  }
  async createIncident(row: Record<string, unknown>) {
    const rec = { id: newId(), ...(row as object) } as IncidentRecord;
    this.incidents.set(rec.id, rec);
    return rec;
  }
  async getIncident(tenantId: string, id: string) {
    const inc = this.incidents.get(id);
    return inc && inc.tenant_id === tenantId ? inc : null;
  }
  async setIncidentStatus(id: string, status: IncidentStatus) {
    const inc = this.incidents.get(id);
    if (inc) inc.status = status;
  }
  async setIncidentBankidVerified(id: string) {
    const inc = this.incidents.get(id);
    if (inc) {
      inc.bankid_verified = true;
      inc.status = "bankid_verified";
    }
  }
  async addEvidence(row: Record<string, unknown>) {
    void row;
    return { id: newId() };
  }
  async recordBankidSignature(row: Record<string, unknown>) {
    void row;
    return { id: newId() };
  }
  async getCustomerContact(incidentId: string) {
    return this.contacts.get(incidentId) ?? null;
  }
  async createTowJob(row: Record<string, unknown>) {
    const rec = { id: newId(), ...(row as object) } as TowJobRecord;
    this.towJobs.set(rec.id, rec);
    return rec;
  }
  async getTowJob(tenantId: string, id: string) {
    const job = this.towJobs.get(id);
    return job && job.tenant_id === tenantId ? job : null;
  }
  async listTowJobs(tenantId: string, opts: { status?: string; limit: number }) {
    return [...this.towJobs.values()]
      .filter((j) => j.tenant_id === tenantId && (!opts.status || j.status === opts.status))
      .slice(0, opts.limit);
  }
  async setTowJobStatus(id: string, status: TowJobStatus) {
    const job = this.towJobs.get(id);
    if (job) job.status = status;
  }
  async addTowJobStatusEvent(row: Record<string, unknown>) {
    void row;
  }
  async assignTowJob(id: string, driverId: string, towCompanyId: string) {
    const job = this.towJobs.get(id);
    if (job) {
      job.driver_id = driverId;
      job.tow_company_id = towCompanyId;
    }
  }
  async createOffers(rows: Array<Record<string, unknown>>) {
    for (const r of rows) {
      this.offers.push({
        id: newId(),
        tow_job_id: r.tow_job_id as string,
        driver_id: r.driver_id as string,
        tow_company_id: (r.tow_company_id as string | undefined) ?? null,
        tenant_id: (r.tenant_id as string | undefined) ?? null,
        status: "pending",
        rank: (r.rank as number | undefined) ?? 0,
        expires_at: (r.expires_at as string | undefined) ?? new Date(Date.now() + 120_000).toISOString(),
        push_status: "pending",
      });
    }
  }
  async getOfferForDriver(jobId: string, driverId: string) {
    const o = this.offers.find((x) => x.tow_job_id === jobId && x.driver_id === driverId);
    return o ? { status: o.status } : null;
  }
  async setOfferStatus(jobId: string, driverId: string, status: string) {
    const o = this.offers.find((x) => x.tow_job_id === jobId && x.driver_id === driverId);
    if (o) o.status = status;
  }
  async acceptOffer(jobId: string, driverId: string): Promise<AcceptOfferResult> {
    const job = this.towJobs.get(jobId);
    if (!job) return { accepted: false, towCompanyId: null, reason: "job_not_found" };
    if (job.driver_id && job.driver_id !== driverId) {
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "already_assigned" };
    }
    const offer = this.offers.find((o) => o.tow_job_id === jobId && o.driver_id === driverId);
    if (!offer || offer.status !== "pending") {
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "no_pending_offer" };
    }
    offer.status = "accepted";
    for (const o of this.offers) {
      if (o.tow_job_id === jobId && o.id !== offer.id && o.status === "pending") o.status = "cancelled";
    }
    job.status = "accepted";
    job.driver_id = driverId;
    job.tow_company_id = offer.tow_company_id ?? job.tow_company_id;
    return { accepted: true, towCompanyId: offer.tow_company_id ?? job.tow_company_id ?? null, reason: null };
  }
  async getOfferById(id: string): Promise<OfferRecord | null> {
    const o = this.offers.find((x) => x.id === id);
    if (!o) return null;
    return {
      id: o.id,
      tow_job_id: o.tow_job_id,
      driver_id: o.driver_id,
      tow_company_id: o.tow_company_id ?? "",
      tenant_id: o.tenant_id ?? "",
      status: o.status,
      rank: o.rank,
      expires_at: o.expires_at,
    };
  }
  async rejectOffer(jobId: string, driverId: string, reason: string | null) {
    const o = this.offers.find((x) => x.tow_job_id === jobId && x.driver_id === driverId);
    if (o) {
      o.status = "rejected";
      o.rejection_reason = reason;
    }
  }
  async getDriverProfile(driverId: string) {
    return this.driverProfiles.get(driverId) ?? null;
  }
  async setDriverOnline(driverId: string, online: boolean) {
    const p = this.driverProfiles.get(driverId);
    if (p) {
      p.is_online = online;
      p.duty_status = online ? "on_duty" : "off_duty";
    }
  }
  async updateDriverLocation(driverId: string, lat: number, lng: number) {
    void driverId;
    void lat;
    void lng;
  }
  async upsertDriverDevice(
    driverId: string,
    userId: string,
    device: { expo_push_token: string; platform: string; device_name?: string | null },
  ) {
    const existing = this.devices.find((d) => d.expo_push_token === device.expo_push_token);
    if (existing) {
      existing.driver_id = driverId;
      existing.user_id = userId;
      existing.platform = device.platform;
    } else {
      this.devices.push({ driver_id: driverId, user_id: userId, expo_push_token: device.expo_push_token, platform: device.platform });
    }
  }
  async listDriverOffers(driverId: string) {
    return this.offers
      .filter((o) => o.driver_id === driverId && o.status === "pending")
      .sort((a, b) => a.rank - b.rank)
      .map((o) => {
        const job = this.towJobs.get(o.tow_job_id);
        const incident = job ? this.incidents.get(job.incident_id) : null;
        return {
          offer_id: o.id,
          tow_job_id: o.tow_job_id,
          status: o.status,
          rank: o.rank,
          expires_at: o.expires_at,
          priority: job?.priority ?? "normal",
          payer_type: job?.payer_type ?? "insurance_company",
          problem_type: incident?.problem_type ?? null,
          approx_area: null,
          distance_meters: null,
        };
      });
  }
  async listDriverDevices(driverId: string): Promise<DriverDeviceRecord[]> {
    return this.devices
      .filter((d) => d.driver_id === driverId)
      .map((d) => ({ expo_push_token: d.expo_push_token, platform: d.platform }));
  }
  async markOfferPush(jobId: string, driverId: string, status: string) {
    const o = this.offers.find((x) => x.tow_job_id === jobId && x.driver_id === driverId);
    if (o) o.push_status = status;
  }
  async loadRoleContext(userId: string): Promise<RoleContext | null> {
    return this.roleContexts.get(userId) ?? null;
  }
  async getDispatchCandidates() {
    return this.candidates;
  }
  async createCustomerShare(row: Record<string, unknown>) {
    this.customerShares.push(row);
  }
  async addEtaSnapshot(row: Record<string, unknown>) {
    this.etaSnapshots.push({
      ...(row as unknown as EtaSnapshotRecord),
      created_at: new Date().toISOString(),
    });
  }
  async getLatestEta(jobId: string) {
    const snaps = this.etaSnapshots.filter((s) => s.tow_job_id === jobId);
    return snaps[snaps.length - 1] ?? null;
  }
  async createCompletionReport(row: Record<string, unknown>) {
    this.completionReports.push(row);
  }
  async createInvoice(row: Record<string, unknown>) {
    this.invoices.push(row);
  }
  async getDriverIdForUser(userId: string) {
    return this.driverUsers.get(userId) ?? null;
  }
}
