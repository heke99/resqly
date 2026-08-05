import { newId } from "@resqly/utils";
import { formatCaseNumber } from "@resqly/utils";
import type { DispatchCandidate } from "@resqly/dispatch";
import { ALL_API_SCOPES } from "./types";
import type {
  AcceptOfferResult,
  ApiClientRecord,
  ApiRepo,
  ApiScope,
  BankidSessionRecord,
  CustomerContact,
  DriverDeviceRecord,
  DriverProfileRecord,
  EtaSnapshotRecord,
  IncidentRecord,
  OfferRecord,
  PriceListRecord,
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
  tow_vehicle_id?: string | null;
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
  max_insurance_broadcast_candidates: 250,
  private_dispatch_wave_radius_km: 15,
  offer_expiry_seconds: 120,
  allow_marketplace_fallback: true,
};

/** In-memory implementation used by tests. Mirrors the Supabase repo behaviour. */
export class MemoryRepo implements ApiRepo {
  private readonly dispatchClaims = new Set<string>();
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
  incidentLocations: Array<{ incident_id: string; kind: string; lat: number; lng: number; address: string | null }> = [];
  idempotencyRecords: Array<{ scope: string; action: string; key: string; resource_id: string | null; response: unknown }> = [];
  bankidSessions = new Map<string, BankidSessionRecord>();
  bankidSignatures: Array<Record<string, unknown>> = [];
  completedBankidSessions = new Set<string>();
  notificationDeliveries: Array<Record<string, unknown>> = [];
  webhookDeliveries: Array<Record<string, unknown>> = [];
  usageEvents: Array<Record<string, unknown>> = [];
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
  seedApiClient(tenantId: string, keyHash: string, scopes: ApiScope[] = ALL_API_SCOPES): ApiClientRecord {
    const rec = { id: newId(), tenantId, active: true, scopes: [...scopes] };
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
  manualReviews: Array<Record<string, unknown>> = [];
  async escalateTowJobManualReview(row: {
    tenant_id: string;
    incident_id: string | null;
    tow_job_id: string;
    status_reason: string;
    review_reason: string;
    actor_user_id?: string | null;
    actor_api_client_id?: string | null;
    actor_kind: "user" | "api_client" | "worker";
    actor_worker?: string | null;
  }) {
    const job = this.towJobs.get(row.tow_job_id);
    if (!job || job.tenant_id !== row.tenant_id) throw new Error("tow job not found");
    const fromStatus = job.status;
    this.towJobs.set(job.id, { ...job, status: "manual_review" });
    for (const offer of this.offers) {
      if (offer.tow_job_id === job.id && offer.status === "pending") offer.status = "cancelled";
    }
    if (!this.manualReviews.some((item) => item.tow_job_id === row.tow_job_id && ["open", "in_progress"].includes(String(item.status)))) {
      this.manualReviews.push({
        tenant_id: row.tenant_id,
        incident_id: row.incident_id,
        tow_job_id: row.tow_job_id,
        reason: row.review_reason,
        status: "open",
        created_by_user_id: row.actor_user_id ?? null,
        created_by_api_client_id: row.actor_api_client_id ?? null,
        created_by_kind: row.actor_kind,
        created_by_worker: row.actor_worker ?? null,
      });
    }
    this.auditLogs.push({
      tenant_id: row.tenant_id,
      actor_user_id: row.actor_user_id ?? null,
      actor_api_client_id: row.actor_api_client_id ?? null,
      actor_kind: row.actor_kind,
      actor_worker: row.actor_worker ?? null,
      action: "status_change",
      entity_type: "tow_job",
      entity_id: row.tow_job_id,
      metadata: { from: fromStatus, to: "manual_review", reason: row.status_reason },
    });
  }

  priceLists = new Map<string, PriceListRecord>(); // keyed by tow company id
  async getActivePriceList(towCompanyId: string): Promise<PriceListRecord | null> {
    return this.priceLists.get(towCompanyId) ?? null;
  }
  async setTowJobPriceSnapshot(jobId: string, snapshot: Record<string, unknown>): Promise<void> {
    const job = this.towJobs.get(jobId);
    if (job && !job.price_snapshot) {
      this.towJobs.set(jobId, { ...job, price_snapshot: snapshot });
    }
  }
  towEvidenceObjects: Array<{ path: string; contentType: string; size: number }> = [];
  towJobEvidence: Array<Record<string, unknown>> = [];
  signedEvidenceUploads = new Map<string, string>();
  async createTowEvidenceUpload(path: string): Promise<{ path: string; token: string }> {
    const token = newId();
    this.signedEvidenceUploads.set(path, token);
    return { path, token };
  }
  async getTowEvidenceObject(path: string): Promise<{ size: number | null; contentType: string | null } | null> {
    const file = this.towEvidenceObjects.find((entry) => entry.path === path);
    return file ? { size: file.size, contentType: file.contentType } : null;
  }
  async createTowJobEvidence(row: Record<string, unknown>): Promise<{ id: string }> {
    const existing = this.towJobEvidence.find((entry) => entry.storage_path === row.storage_path);
    if (existing) return { id: String(existing.id) };
    const id = newId();
    this.towJobEvidence.push({ id, ...row });
    return { id };
  }
  async getIncidentCoordinates(incidentId: string): Promise<{
    pickup: { lat: number; lng: number } | null;
    destination: { lat: number; lng: number } | null;
  }> {
    const coord = (kind: string) => {
      const row = [...this.incidentLocations]
        .reverse()
        .find((l) => l.incident_id === incidentId && l.kind === kind && l.lat != null && l.lng != null);
      return row ? { lat: row.lat, lng: row.lng } : null;
    };
    return { pickup: coord("pickup"), destination: coord("destination") };
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
  async assertIncidentContext(_input: {
    tenantId: string;
    customerUserId: string;
    vehicleId: string | null;
    insuranceCompanyId: string | null;
  }) {
    // Unit tests use synthetic UUIDs without a complete relational fixture.
    // Production enforcement lives both in SupabaseRepo and migration 0027.
  }
  async createIncident(row: Record<string, unknown>) {
    const rec = { id: newId(), ...(row as object) } as IncidentRecord;
    this.incidents.set(rec.id, rec);
    return rec;
  }
  async upsertIncidentLocation(row: {
    incident_id: string;
    kind: string;
    lat: number;
    lng: number;
    address?: string | null;
  }) {
    const previous = this.incidentLocations.find(
      (l) => l.incident_id === row.incident_id && l.kind === row.kind,
    );
    this.incidentLocations = this.incidentLocations.filter(
      (l) => !(l.incident_id === row.incident_id && l.kind === row.kind),
    );
    this.incidentLocations.push({
      ...row,
      address: row.address === undefined ? previous?.address ?? null : row.address,
    });
    // Keep the contact pickup in sync so dispatch/share tests see real coords.
    const contact = this.contacts.get(row.incident_id);
    if (contact && row.kind === "pickup") {
      contact.pickup = { lat: row.lat, lng: row.lng };
      contact.pickup_address = row.address ?? contact.pickup_address;
    }
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
  async createBankidSession(row: Record<string, unknown>): Promise<BankidSessionRecord> {
    const rec = { id: newId(), ...(row as object) } as BankidSessionRecord;
    this.bankidSessions.set(rec.id, rec);
    if (rec.tic_session_id) this.bankidSessions.set(rec.tic_session_id, rec);
    return rec;
  }
  async updateBankidSession(sessionId: string, patch: Record<string, unknown>) {
    const rec = this.bankidSessions.get(sessionId);
    if (!rec) return;
    Object.assign(rec, patch);
    if (rec.tic_session_id) this.bankidSessions.set(rec.tic_session_id, rec);
  }
  async getBankidSessionByTicSessionId(sessionId: string): Promise<BankidSessionRecord | null> {
    const rec = this.bankidSessions.get(sessionId);
    return rec?.tic_session_id === sessionId ? rec : null;
  }
  async getBankidSessionById(sessionId: string): Promise<BankidSessionRecord | null> {
    return this.bankidSessions.get(sessionId) ?? null;
  }
  async recordBankidSignature(row: Record<string, unknown>) {
    const existing = this.bankidSignatures.find((entry) => entry.order_ref === row.order_ref);
    if (existing) return { id: String(existing.id) };
    const id = newId();
    this.bankidSignatures.push({ id, ...row });
    return { id };
  }
  async completeBankidSession(input: {
    sessionId: string;
    signature: Record<string, unknown>;
    businessPayload: Record<string, unknown>;
    result: Record<string, unknown>;
    fromWebhook: boolean;
  }) {
    const session = this.bankidSessions.get(input.sessionId)
      ?? [...this.bankidSessions.values()].find((row) => row.tic_session_id === input.sessionId);
    if (!session) throw new Error("bankid_session_not_found");
    const already = this.completedBankidSessions.has(session.id);
    const saved = await this.recordBankidSignature(input.signature);
    const vehiclePolicyId = typeof input.businessPayload.vehicle_policy_id === "string"
      ? input.businessPayload.vehicle_policy_id
      : null;
    if (!already) {
      this.completedBankidSessions.add(session.id);
      session.status = "complete";
      if (session.incident_id) await this.setIncidentBankidVerified(session.incident_id);
    }
    return {
      newlyProcessed: !already,
      signatureId: saved.id,
      flow: session.incident_id ? "incident" as const : "vehicle_policy" as const,
      relatedId: session.incident_id ?? vehiclePolicyId,
    };
  }
  async getCustomerContact(incidentId: string) {
    return this.contacts.get(incidentId) ?? null;
  }
  async createTowJob(row: Record<string, unknown>) {
    const rec = {
      id: newId(),
      tow_company_id: null,
      driver_id: null,
      ...(row as object),
    } as TowJobRecord;
    this.towJobs.set(rec.id, rec);
    return rec;
  }
  async getTowJob(tenantId: string, id: string) {
    const job = this.towJobs.get(id);
    return job && job.tenant_id === tenantId ? job : null;
  }
  async getTowJobById(id: string) {
    return this.towJobs.get(id) ?? null;
  }
  async getActiveTowJobForIncident(tenantId: string, incidentId: string) {
    return [...this.towJobs.values()].find((job) =>
      job.tenant_id === tenantId && job.incident_id === incidentId && !["cancelled", "failed", "closed"].includes(job.status),
    ) ?? null;
  }
  async claimTowDispatch(jobId: string): Promise<{ claimed: boolean; status: string }> {
    const job = this.towJobs.get(jobId);
    if (!job) throw new Error("tow_job_not_found");
    if (job.driver_id || !["created", "matching"].includes(job.status) || this.dispatchClaims.has(jobId)) {
      return { claimed: false, status: job.status };
    }
    this.dispatchClaims.add(jobId);
    return { claimed: true, status: job.status };
  }
  async recordDispatchAttempt(jobId: string, error: string | null): Promise<{ attempts: number; status: string }> {
    this.dispatchClaims.delete(jobId);
    const job = this.towJobs.get(jobId) as (TowJobRecord & { dispatch_attempts?: number; last_dispatch_error?: string | null }) | undefined;
    if (!job) return { attempts: 0, status: "created" };
    job.dispatch_attempts = (job.dispatch_attempts ?? 0) + 1;
    job.last_dispatch_error = error;
    if (error && job.dispatch_attempts >= 3 && ["created", "matching", "offered"].includes(job.status)) {
      job.status = "manual_review";
    }
    return { attempts: job.dispatch_attempts, status: job.status };
  }
  async listTowJobs(tenantId: string, opts: { status?: string; limit: number }) {
    return [...this.towJobs.values()]
      .filter((j) => j.tenant_id === tenantId && (!opts.status || j.status === opts.status))
      .slice(0, opts.limit);
  }
  async transitionTowJobStatus(row: {
    tow_job_id: string;
    from_status: string | null;
    to_status: string;
    actor_user_id?: string | null;
    actor_api_client_id?: string | null;
    actor_worker?: string | null;
    reason?: string | null;
  }) {
    const job = this.towJobs.get(row.tow_job_id);
    if (!job) throw new Error("tow_job_not_found");
    if (row.from_status && job.status !== row.from_status) throw new Error("stale_status");
    job.status = row.to_status as TowJobStatus;
    this.auditLogs.push({
      tenant_id: job.tenant_id,
      actor_user_id: row.actor_user_id ?? null,
      actor_api_client_id: row.actor_api_client_id ?? null,
      actor_worker: row.actor_worker ?? null,
      action: "status_change",
      entity_type: "tow_job",
      entity_id: job.id,
      fields: ["status"],
      metadata: { from: row.from_status, to: row.to_status },
    });
  }
  async assignTowJob(_tenantId: string, id: string, driverId: string, towCompanyId: string, towVehicleId: string) {
    const job = this.towJobs.get(id);
    if (job) {
      job.driver_id = driverId;
      job.tow_company_id = towCompanyId;
      job.tow_vehicle_id = towVehicleId;
    }
  }
  async createOffers(rows: Array<Record<string, unknown>>) {
    for (const r of rows) {
      const existing = this.offers.find(
        (offer) => offer.tow_job_id === r.tow_job_id && offer.driver_id === r.driver_id,
      );
      const refreshed = {
        tow_company_id: (r.tow_company_id as string | undefined) ?? null,
        tow_vehicle_id: (r.tow_vehicle_id as string | undefined) ?? null,
        tenant_id: (r.tenant_id as string | undefined) ?? null,
        status: "pending",
        rank: (r.rank as number | undefined) ?? 0,
        expires_at: (r.expires_at as string | undefined) ?? new Date(Date.now() + 120_000).toISOString(),
        push_status: "pending",
      };
      if (existing) {
        Object.assign(existing, refreshed);
      } else {
        this.offers.push({
          id: newId(),
          tow_job_id: r.tow_job_id as string,
          driver_id: r.driver_id as string,
          ...refreshed,
        });
      }
    }
  }
  async getOfferForDriver(jobId: string, driverId: string) {
    const o = this.offers.find((x) => x.tow_job_id === jobId && x.driver_id === driverId);
    return o ? { status: o.status } : null;
  }
  // Mirrors the accept_tow_offer SQL function (0020): row-lock semantics are
  // approximated, expired offers are rejected, and a retry by the winning
  // driver is idempotent.
  async acceptOffer(jobId: string, driverId: string): Promise<AcceptOfferResult> {
    const job = this.towJobs.get(jobId);
    if (!job) return { accepted: false, towCompanyId: null, reason: "job_not_found" };
    if (job.driver_id && job.driver_id !== driverId) {
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "already_assigned" };
    }
    if (job.driver_id === driverId && job.status === "accepted") {
      return { accepted: true, towCompanyId: job.tow_company_id ?? null, reason: "already_accepted_by_driver" };
    }
    if (job.status !== "offered" && job.status !== "matching") {
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "job_not_offerable" };
    }
    const offer = this.offers.find((o) => o.tow_job_id === jobId && o.driver_id === driverId);
    if (!offer || offer.status !== "pending") {
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "no_pending_offer" };
    }
    if (offer.expires_at && new Date(offer.expires_at).getTime() < Date.now()) {
      offer.status = "expired";
      return { accepted: false, towCompanyId: job.tow_company_id ?? null, reason: "offer_expired" };
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
      tow_vehicle_id: o.tow_vehicle_id ?? null,
      tenant_id: o.tenant_id ?? "",
      status: o.status,
      rank: o.rank,
      expires_at: o.expires_at,
    };
  }
  async rejectOffer(jobId: string, driverId: string, reason: string | null) {
    const o = this.offers.find(
      (x) => x.tow_job_id === jobId && x.driver_id === driverId && x.status === "pending",
    );
    if (!o) return false;
    o.status = "rejected";
    o.rejection_reason = reason;
    return true;
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
  async listDriverJobs(driverId: string, opts?: { history?: boolean }): Promise<TowJobRecord[]> {
    const statuses = opts?.history
      ? ["completed", "invoiced", "closed", "cancelled", "failed"]
      : ["accepted", "driver_en_route", "driver_arrived", "vehicle_loaded", "transporting", "delivered"];
    return [...this.towJobs.values()].filter(
      (j) => j.driver_id === driverId && statuses.includes(j.status),
    );
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
  async recordNotificationDelivery(row: Record<string, unknown>) {
    if (row.dedupe_key && this.notificationDeliveries.some((d) => d.dedupe_key === row.dedupe_key)) {
      return;
    }
    this.notificationDeliveries.push(row);
  }
  async hasNotificationDelivery(dedupeKey: string): Promise<boolean> {
    return this.notificationDeliveries.some((d) => d.dedupe_key === dedupeKey);
  }
  async enqueueWebhookEvent(tenantId: string, event: string, payload: Record<string, unknown>) {
    this.webhookDeliveries.push({ tenant_id: tenantId, event, payload, status: "pending" });
  }
  async recordUsageEvent(tenantId: string, kind: string, quantity = 1) {
    this.usageEvents.push({ tenant_id: tenantId, kind, quantity });
  }
  async loadRoleContext(userId: string): Promise<RoleContext | null> {
    return this.roleContexts.get(userId) ?? null;
  }
  async getDispatchCandidates() {
    return this.candidates;
  }
  async createCustomerShare(row: Record<string, unknown>) {
    await this.ensureCustomerShare(row);
  }
  async ensureCustomerShare(row: Record<string, unknown>): Promise<{ id: string }> {
    const jobId = String(row.tow_job_id);
    const driverId = String(row.driver_id);
    const existing = this.customerShares.find((share) => share.tow_job_id === jobId && share.driver_id === driverId);
    if (existing) {
      Object.assign(existing, row);
      return { id: String(existing.id) };
    }
    const id = newId();
    this.customerShares.push({ id, ...row });
    return { id };
  }
  async getCustomerShare(jobId: string, driverId: string): Promise<{ id: string } | null> {
    const existing = this.customerShares.find((share) => share.tow_job_id === jobId && share.driver_id === driverId);
    return existing ? { id: String(existing.id) } : null;
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
  async finalizeTowJob(
    jobId: string,
    driverId: string,
    report: Record<string, unknown>,
    invoice: Record<string, unknown>,
  ): Promise<{ status: string; total_minor: number; already_finalized: boolean }> {
    const job = this.towJobs.get(jobId);
    if (!job || job.driver_id !== driverId) throw new Error("forbidden");
    const alreadyFinalized = job.status === "invoiced";
    const reportIndex = this.completionReports.findIndex((row) => row.tow_job_id === jobId);
    if (reportIndex >= 0) this.completionReports[reportIndex] = report;
    else this.completionReports.push(report);
    const invoiceIndex = this.invoices.findIndex((row) => row.tow_job_id === jobId);
    if (invoiceIndex >= 0) this.invoices[invoiceIndex] = invoice;
    else this.invoices.push(invoice);
    job.status = "invoiced";
    return { status: "invoiced", total_minor: Number(invoice.total_minor ?? 0), already_finalized: alreadyFinalized };
  }
  async getDriverIdForUser(userId: string) {
    return this.driverUsers.get(userId) ?? null;
  }
  async findIdempotentResponse(scope: string, action: string, key: string) {
    const rec = this.idempotencyRecords.find(
      (r) => r.scope === scope && r.action === action && r.key === key,
    );
    return rec ? { resource_id: rec.resource_id, response: rec.response } : null;
  }
  async storeIdempotentResponse(
    scope: string,
    action: string,
    key: string,
    resourceId: string | null,
    response: unknown,
  ) {
    const existing = await this.findIdempotentResponse(scope, action, key);
    if (existing) return;
    this.idempotencyRecords.push({ scope, action, key, resource_id: resourceId, response });
  }
}
