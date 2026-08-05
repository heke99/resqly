import { allocateCaseNumber, type AppSupabaseClient } from "@resqly/database";
import type { Coordinate, IncidentStatus } from "@resqly/types";
import type { DispatchCandidate } from "@resqly/dispatch";
import type {
  AcceptOfferResult,
  ApiClientRecord,
  ApiRepo,
  ApiScope,
  BankidSessionRecord,
  CustomerContact,
  DispatchCandidateOptions,
  DriverDeviceRecord,
  DriverProfileRecord,
  EtaSnapshotRecord,
  IncidentRecord,
  OfferRecord,
  PriceListRecord,
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
  max_insurance_broadcast_candidates: 250,
  private_dispatch_wave_radius_km: 15,
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
    const { data, error } = await this.table("tenant_api_clients")
      .select("id, tenant_id, active, scopes")
      .eq("api_key_hash", hash)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const row = data as { id: string; tenant_id: string; active: boolean; scopes?: string[] | null };
    return {
      id: row.id,
      tenantId: row.tenant_id,
      active: row.active,
      scopes: (row.scopes ?? []) as ApiScope[],
    };
  }

  async logApiRequest(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.table("api_request_logs").insert(row as never);
    if (error) throw new Error(error.message);
  }
  async recordAudit(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.table("audit_logs").insert(row as never);
    if (error) throw new Error(error.message);
  }

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
  }): Promise<void> {
    const { data, error } = await this.db.rpc("escalate_tow_job_manual_review" as never, {
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
  }

  async getTenant(id: string): Promise<TenantRecord | null> {
    const { data, error } = await this.table("tenants")
      .select("id, slug, name, type, case_number_prefix")
      .eq("id", id)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TenantRecord | null) ?? null;
  }

  async getTenantSettings(id: string): Promise<TenantSettingsRecord> {
    const { data, error } = await this.table("tenant_settings").select("*").eq("tenant_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return { ...DEFAULT_SETTINGS, ...((data as Partial<TenantSettingsRecord> | null) ?? {}) };
  }
  async getTenantBranding(id: string) {
    const { data, error } = await this.table("tenant_branding").select("*").eq("tenant_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }
  async getTenantThemeTokens(id: string) {
    const { data, error } = await this.table("tenant_theme_tokens").select("*").eq("tenant_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Record<string, unknown> | null) ?? null;
  }
  async updateTenantBranding(id: string, patch: Record<string, unknown>) {
    const { error } = await this.table("tenant_branding").update(patch as never).eq("tenant_id", id);
    if (error) throw new Error(error.message);
  }
  async updateTenantSettings(id: string, patch: Record<string, unknown>) {
    const { error } = await this.table("tenant_settings").update(patch as never).eq("tenant_id", id);
    if (error) throw new Error(error.message);
  }

  async allocateCaseNumber(tenantId: string, scope: string): Promise<string> {
    return allocateCaseNumber(this.db, tenantId, scope);
  }

  async assertIncidentContext(input: {
    tenantId: string;
    customerUserId: string;
    vehicleId: string | null;
    insuranceCompanyId: string | null;
  }): Promise<void> {
    const { data: customer, error: customerError } = await this.table("user_profiles")
      .select("id")
      .eq("id", input.customerUserId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer) throw new Error("customer_user_not_found");

    if (input.vehicleId) {
      const { data: vehicle, error: vehicleError } = await this.table("vehicles")
        .select("id, owner_user_id")
        .eq("id", input.vehicleId)
        .maybeSingle();
      if (vehicleError) throw new Error(vehicleError.message);
      if (!vehicle) throw new Error("vehicle_not_found");
      const ownerUserId = (vehicle as { owner_user_id?: string }).owner_user_id ?? null;
      if (ownerUserId !== input.customerUserId) {
        const { data: coOwner, error: coOwnerError } = await this.table("vehicle_owners")
          .select("id")
          .eq("vehicle_id", input.vehicleId)
          .eq("user_id", input.customerUserId)
          .maybeSingle();
        if (coOwnerError) throw new Error(coOwnerError.message);
        if (!coOwner) throw new Error("vehicle_not_owned_by_customer");
      }
    }

    if (input.insuranceCompanyId) {
      const { data: insurer, error: insurerError } = await this.table("insurance_companies")
        .select("id, tenant_id, active")
        .eq("id", input.insuranceCompanyId)
        .maybeSingle();
      if (insurerError) throw new Error(insurerError.message);
      const row = insurer as { tenant_id?: string; active?: boolean } | null;
      if (!row) throw new Error("insurance_company_not_found");
      if (row.tenant_id !== input.tenantId) throw new Error("insurance_company_wrong_tenant");
      if (row.active !== true) throw new Error("insurance_company_inactive");
    }
  }

  async createIncident(row: Record<string, unknown>): Promise<IncidentRecord> {
    const { data, error } = await this.table("incidents").insert(row as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as IncidentRecord;
  }
  async upsertIncidentLocation(row: {
    incident_id: string;
    kind: string;
    lat: number;
    lng: number;
    address?: string | null;
  }): Promise<void> {
    const payload: Record<string, unknown> = {
      incident_id: row.incident_id,
      kind: row.kind,
      lat: row.lat,
      lng: row.lng,
    };
    if (row.address !== undefined) payload.address = row.address;
    const { error } = await this.table("incident_locations").upsert(
      payload as never,
      { onConflict: "incident_id,kind" } as never,
    );
    if (error) throw new Error(error.message);
  }
  async getIncident(tenantId: string, id: string): Promise<IncidentRecord | null> {
    const { data, error } = await this.table("incidents")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as IncidentRecord | null) ?? null;
  }
  async setIncidentStatus(id: string, status: IncidentStatus) {
    const { error } = await this.table("incidents").update({ status } as never).eq("id", id);
    if (error) throw new Error(error.message);
  }
  async setIncidentBankidVerified(id: string) {
    const { error } = await this.table("incidents")
      .update({ bankid_verified: true, status: "bankid_verified" } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
  async addEvidence(row: Record<string, unknown>) {
    const { data, error } = await this.table("incident_evidence").insert(row as never).select("id").single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }
  async createBankidSession(row: Record<string, unknown>): Promise<BankidSessionRecord> {
    const { data, error } = await this.table("bankid_sessions").insert(row as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as BankidSessionRecord;
  }
  async updateBankidSession(sessionId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.table("bankid_sessions")
      .update(patch as never)
      .or(`id.eq.${sessionId},tic_session_id.eq.${sessionId}`);
    if (error) throw new Error(error.message);
  }
  async getBankidSessionByTicSessionId(sessionId: string): Promise<BankidSessionRecord | null> {
    const { data, error } = await this.table("bankid_sessions")
      .select("*")
      .eq("tic_session_id", sessionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BankidSessionRecord | null) ?? null;
  }
  async getBankidSessionById(sessionId: string): Promise<BankidSessionRecord | null> {
    const { data, error } = await this.table("bankid_sessions")
      .select("*")
      .or(`id.eq.${sessionId},tic_session_id.eq.${sessionId}`)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as BankidSessionRecord | null) ?? null;
  }
  async recordBankidSignature(row: Record<string, unknown>) {
    const { data, error } = await this.table("bankid_signatures")
      .upsert(row as never, { onConflict: "order_ref" } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }

  async completeBankidSession(input: {
    sessionId: string;
    signature: Record<string, unknown>;
    businessPayload: Record<string, unknown>;
    result: Record<string, unknown>;
    fromWebhook: boolean;
  }) {
    const { data, error } = await this.db.rpc("complete_bankid_session" as never, {
      p_session_id: input.sessionId,
      p_signature: input.signature,
      p_business_payload: input.businessPayload,
      p_result: input.result,
      p_from_webhook: input.fromWebhook,
    } as never);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as {
      newly_processed?: boolean;
      signature_id?: string | null;
      flow?: "incident" | "vehicle_policy";
      related_id?: string | null;
    } | null;
    return {
      newlyProcessed: Boolean(row?.newly_processed),
      signatureId: row?.signature_id ?? null,
      flow: row?.flow ?? "incident",
      relatedId: row?.related_id ?? null,
    };
  }

  async getCustomerContact(incidentId: string): Promise<CustomerContact | null> {
    const { data: incident, error: incidentError } = await this.table("incidents")
      .select("id, problem_type, description, customer_user_id, vehicle_id")
      .eq("id", incidentId)
      .maybeSingle();
    if (incidentError) throw new Error(incidentError.message);
    if (!incident) return null;
    const inc = incident as {
      problem_type: string | null;
      description: string | null;
      customer_user_id: string;
      vehicle_id: string | null;
    };
    const { data: profile, error: profileError } = await this.table("user_profiles")
      .select("full_name, phone, email")
      .eq("id", inc.customer_user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    let vehicle: unknown = null;
    if (inc.vehicle_id) {
      const { data, error } = await this.table("vehicles")
        .select("registration_number")
        .eq("id", inc.vehicle_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      vehicle = data;
    }

    const { data: loc, error: locationError } = await this.table("incident_locations")
      .select("lat, lng, address")
      .eq("incident_id", incidentId)
      .eq("kind", "pickup")
      .maybeSingle();
    if (locationError) throw new Error(locationError.message);
    const { data: dest, error: destinationError } = await this.table("incident_locations")
      .select("address")
      .eq("incident_id", incidentId)
      .eq("kind", "destination")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (destinationError) throw new Error(destinationError.message);
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
      destination_address: (dest as { address?: string | null } | null)?.address ?? null,
      customer_notes: inc.description,
    };
  }

  async createTowJob(row: Record<string, unknown>): Promise<TowJobRecord> {
    const { data, error } = await this.table("tow_jobs").insert(row as never).select("*").single();
    if (error) throw new Error(error.message);
    return data as TowJobRecord;
  }

  async getActivePriceList(towCompanyId: string): Promise<PriceListRecord | null> {
    const { data, error } = await this.table("tow_price_lists")
      .select(
        "start_fee_minor, per_km_minor, per_waiting_minute_minor, failed_trip_minor, on_call_surcharge_minor, heavy_tow_minor, minimum_price_minor, evening_night_surcharge_minor, weekend_surcharge_minor, cancellation_policy, currency",
      )
      .eq("tow_company_id", towCompanyId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as PriceListRecord | null) ?? null;
  }

  async setTowJobPriceSnapshot(jobId: string, snapshot: Record<string, unknown>): Promise<void> {
    const { error } = await this.table("tow_jobs")
      .update({ price_snapshot: snapshot } as never)
      .eq("id", jobId)
      .is("price_snapshot", null);
    if (error) throw new Error(error.message);
  }

  async createTowEvidenceUpload(path: string): Promise<{ path: string; token: string }> {
    const { data, error } = await this.db.storage.from("tow-evidence").createSignedUploadUrl(path);
    if (error || !data?.token) throw new Error(error?.message ?? "Could not create signed upload URL");
    return { path: data.path ?? path, token: data.token };
  }

  async getTowEvidenceObject(path: string): Promise<{ size: number | null; contentType: string | null } | null> {
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const { data, error } = await this.db.storage.from("tow-evidence").list(folder, { search: name, limit: 20 });
    if (error) throw new Error(error.message);
    const file = data?.find((entry: { name: string; metadata?: unknown }) => entry.name === name);
    if (!file) return null;
    const metadata = file.metadata as { size?: number; mimetype?: string; contentType?: string } | null;
    return {
      size: typeof metadata?.size === "number" ? metadata.size : null,
      contentType: metadata?.mimetype ?? metadata?.contentType ?? null,
    };
  }

  async createTowJobEvidence(row: Record<string, unknown>): Promise<{ id: string }> {
    const { data, error } = await this.table("tow_job_evidence")
      .upsert(row as never, { onConflict: "storage_path" } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }

  async getIncidentCoordinates(incidentId: string): Promise<{
    pickup: Coordinate | null;
    destination: Coordinate | null;
  }> {
    const { data, error } = await this.table("incident_locations")
      .select("kind, lat, lng, created_at")
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data as Array<{ kind: string; lat: number | null; lng: number | null }> | null) ?? [];
    const coord = (kind: string): Coordinate | null => {
      const row = rows.find((r) => r.kind === kind && r.lat != null && r.lng != null);
      return row ? { lat: Number(row.lat), lng: Number(row.lng) } : null;
    };
    return { pickup: coord("pickup"), destination: coord("destination") };
  }
  async getTowJob(tenantId: string, id: string): Promise<TowJobRecord | null> {
    const { data, error } = await this.table("tow_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TowJobRecord | null) ?? null;
  }
  async getTowJobById(id: string): Promise<TowJobRecord | null> {
    const { data, error } = await this.table("tow_jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TowJobRecord | null) ?? null;
  }
  async getActiveTowJobForIncident(tenantId: string, incidentId: string): Promise<TowJobRecord | null> {
    const { data, error } = await this.table("tow_jobs")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("incident_id", incidentId)
      .not("status", "in", "(cancelled,failed,closed)" as never)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as TowJobRecord | null) ?? null;
  }

  async claimTowDispatch(jobId: string): Promise<{ claimed: boolean; status: string }> {
    const { data, error } = await this.db.rpc("claim_tow_dispatch_job" as never, {
      p_job: jobId,
      p_lease_seconds: 300,
    } as never);
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as { claimed?: boolean; job_status?: string } | null;
    return { claimed: Boolean(row?.claimed), status: row?.job_status ?? "created" };
  }

  async recordDispatchAttempt(jobId: string, errorMessage: string | null): Promise<{ attempts: number; status: string }> {
    const { data, error } = await this.db.rpc("record_tow_dispatch_attempt" as never, {
      p_job: jobId,
      p_error: errorMessage,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const parsed = row as { attempts?: number; job_status?: string } | null;
    return {
      attempts: Number(parsed?.attempts ?? 0),
      status: parsed?.job_status ?? "created",
    };
  }

  async listTowJobs(tenantId: string, opts: { status?: string; limit: number }) {
    let q = this.table("tow_jobs").select("*").eq("tenant_id", tenantId);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q.limit(opts.limit);
    if (error) throw new Error(error.message);
    return (data as TowJobRecord[] | null) ?? [];
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
    const { data, error } = await this.db.rpc("transition_tow_job_status" as never, {
      p_job: row.tow_job_id,
      p_expected_from: row.from_status,
      p_to_status: row.to_status,
      p_actor_user: row.actor_user_id ?? null,
      p_actor_api_client: row.actor_api_client_id ?? null,
      p_actor_worker: row.actor_worker ?? null,
      p_reason: row.reason ?? null,
    } as never);
    if (error) throw new Error(error.message);
    const result = (Array.isArray(data) ? data[0] : data) as { error?: string; actual?: string } | null;
    if (result?.error) throw new Error(`tow status transition failed: ${result.error}${result.actual ? ` (${result.actual})` : ""}`);
  }
  async assignTowJob(tenantId: string, id: string, driverId: string, towCompanyId: string, towVehicleId: string) {
    const { error: updateError } = await this.table("tow_jobs")
      .update({ driver_id: driverId, tow_company_id: towCompanyId, tow_vehicle_id: towVehicleId } as never)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (updateError) throw new Error(updateError.message);
    const { error: assignmentError } = await this.table("tow_job_assignments").insert({
      tenant_id: tenantId,
      tow_job_id: id,
      driver_id: driverId,
      tow_company_id: towCompanyId,
    } as never);
    if (assignmentError) throw new Error(assignmentError.message);
  }
  async createOffers(rows: Array<Record<string, unknown>>) {
    const { error } = await this.table("tow_job_offers").upsert(rows as never, {
      onConflict: "tow_job_id,driver_id",
    } as never);
    if (error) throw new Error(error.message);
  }
  async getOfferForDriver(jobId: string, driverId: string) {
    const { data, error } = await this.table("tow_job_offers")
      .select("status")
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { status: string } | null) ?? null;
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
    return rows.map((d) => ({
      driverId: d.driver_id,
      towCompanyId: d.tow_company_id,
      towVehicleId: d.tow_vehicle_id ?? null,
      insuranceAgreementId: d.insurance_agreement_id ?? null,
      agreementPriority: d.agreement_priority ?? null,
      inPreferredNetwork: Boolean(d.insurance_agreement_id),
      marketplaceEnabled: Boolean(d.marketplace_enabled),
      dutyStatus: (d.duty_status as DispatchCandidate["dutyStatus"]) ?? "on_duty",
      distanceMeters: d.distance_m,
      location: d.driver_lat != null && d.driver_lng != null ? { lat: d.driver_lat, lng: d.driver_lng } : undefined,
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
    const { data, error } = await this.table("tow_job_offers")
      .select("id, tow_job_id, driver_id, tow_company_id, tow_vehicle_id, tenant_id, status, rank, expires_at")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OfferRecord | null) ?? null;
  }

  async rejectOffer(jobId: string, driverId: string, reason: string | null): Promise<boolean> {
    const { data, error } = await this.table("tow_job_offers")
      .update({ status: "rejected", rejected_at: new Date().toISOString(), rejection_reason: reason } as never)
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async getDriverProfile(driverId: string): Promise<DriverProfileRecord | null> {
    const { data, error } = await this.table("tow_drivers")
      .select("id, tenant_id, tow_company_id, user_id, full_name, is_online, status, duty_status")
      .eq("id", driverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DriverProfileRecord | null) ?? null;
  }

  async setDriverOnline(driverId: string, online: boolean): Promise<void> {
    const { error } = await this.table("tow_drivers")
      .update({
        is_online: online,
        duty_status: online ? "on_duty" : "off_duty",
        last_seen_at: new Date().toISOString(),
      } as never)
      .eq("id", driverId);
    if (error) throw new Error(error.message);
  }

  async updateDriverLocation(driverId: string, lat: number, lng: number): Promise<void> {
    const { error } = await this.table("tow_drivers")
      .update({ last_lat: lat, last_lng: lng, last_seen_at: new Date().toISOString() } as never)
      .eq("id", driverId);
    if (error) throw new Error(error.message);
  }

  async upsertDriverDevice(
    driverId: string,
    userId: string,
    device: { expo_push_token: string; platform: string; device_name?: string | null },
  ): Promise<void> {
    const { error } = await this.table("driver_devices").upsert(
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
    if (error) throw new Error(error.message);
  }

  async listDriverOffers(driverId: string) {
    const { data, error } = await this.table("tow_job_offers")
      .select("id, tow_job_id, status, rank, expires_at")
      .eq("driver_id", driverId)
      .eq("status", "pending")
      .order("rank", { ascending: true });
    if (error) throw new Error(error.message);
    const offers = (data as Array<{ id: string; tow_job_id: string; status: string; rank: number; expires_at: string }> | null) ?? [];
    const result = [] as Awaited<ReturnType<ApiRepo["listDriverOffers"]>>;
    for (const o of offers) {
      const { data: job, error: jobError } = await this.table("tow_jobs")
        .select("priority, payer_type, incident_id")
        .eq("id", o.tow_job_id)
        .maybeSingle();
      if (jobError) throw new Error(jobError.message);
      const j = job as { priority: string; payer_type: string; incident_id: string } | null;
      let problemType: string | null = null;
      let approxArea: string | null = null;
      if (j) {
        const { data: inc, error: incidentError } = await this.table("incidents")
          .select("problem_type")
          .eq("id", j.incident_id)
          .maybeSingle();
        if (incidentError) throw new Error(incidentError.message);
        problemType = (inc as { problem_type: string | null } | null)?.problem_type ?? null;
        const { data: loc, error: locationError } = await this.table("incident_locations")
          .select("lat, lng")
          .eq("incident_id", j.incident_id)
          .eq("kind", "pickup")
          .maybeSingle();
        if (locationError) throw new Error(locationError.message);
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

  async listDriverJobs(driverId: string, opts?: { history?: boolean }): Promise<TowJobRecord[]> {
    const statuses = opts?.history
      ? ["completed", "invoiced", "closed", "cancelled", "failed"]
      : ["accepted", "driver_en_route", "driver_arrived", "vehicle_loaded", "transporting", "delivered"];
    const { data, error } = await this.table("tow_jobs")
      .select("*")
      .eq("driver_id", driverId)
      .in("status", statuses as never)
      .order("created_at", { ascending: false })
      .limit(opts?.history ? 50 : 20);
    if (error) throw new Error(error.message);
    return (data as TowJobRecord[] | null) ?? [];
  }

  async listDriverDevices(driverId: string): Promise<DriverDeviceRecord[]> {
    const { data, error } = await this.table("driver_devices")
      .select("expo_push_token, platform")
      .eq("driver_id", driverId);
    if (error) throw new Error(error.message);
    return (data as DriverDeviceRecord[] | null) ?? [];
  }

  async markOfferPush(jobId: string, driverId: string, status: string, error?: string | null): Promise<void> {
    const patch: Record<string, unknown> = { push_status: status };
    if (status === "sent") patch.push_sent_at = new Date().toISOString();
    if (error) patch.push_error = error;
    const { error: updateError } = await this.table("tow_job_offers")
      .update(patch as never)
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId);
    if (updateError) throw new Error(updateError.message);
  }

  async recordNotificationDelivery(row: Record<string, unknown>): Promise<void> {
    // A dedupe-key conflict means the notification was already recorded —
    // silently skip so retries stay idempotent.
    const { error } = await this.table("notification_deliveries").insert(row as never);
    if (error && error.code !== "23505") throw new Error(error.message);
  }

  async hasNotificationDelivery(dedupeKey: string): Promise<boolean> {
    const { data, error } = await this.table("notification_deliveries")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return Boolean(data);
  }

  async enqueueWebhookEvent(tenantId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const { data, error } = await this.table("tenant_webhooks")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .contains("events", [event] as never);
    if (error) throw new Error(error.message);
    const hooks = (data as Array<{ id: string }> | null) ?? [];
    if (hooks.length === 0) return;
    const { error: deliveryError } = await this.table("webhook_deliveries").insert(
      hooks.map((hook) => ({
        tenant_id: tenantId,
        webhook_id: hook.id,
        event,
        payload,
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      })) as never,
    );
    if (deliveryError) throw new Error(deliveryError.message);
  }

  async recordUsageEvent(tenantId: string, kind: string, quantity = 1): Promise<void> {
    const { error } = await this.table("billing_usage_events").insert({ tenant_id: tenantId, kind, quantity } as never);
    if (error) throw new Error(error.message);
  }

  async loadRoleContext(userId: string): Promise<RoleContext | null> {
    const { data: profile, error: profileError } = await this.table("user_profiles")
      .select("id, email, full_name, is_platform_admin")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) return null;
    const p = profile as { id: string; email: string | null; full_name: string | null; is_platform_admin: boolean };

    const { data: memberships, error: membershipError } = await this.table("tenant_users")
      .select("tenant_id, status")
      .eq("user_id", userId)
      .eq("status", "active");
    if (membershipError) throw new Error(membershipError.message);
    const tenantIds = ((memberships as Array<{ tenant_id: string }> | null) ?? []).map((m) => m.tenant_id);

    const tenants: RoleContextTenant[] = [];
    for (const tid of tenantIds) {
      const { data: t, error: tenantError } = await this.table("tenants")
        .select("id, type, name")
        .eq("id", tid)
        .eq("status", "active")
        .maybeSingle();
      if (tenantError) throw new Error(tenantError.message);
      const tt = t as { id: string; type: string; name: string } | null;
      if (!tt) continue;
      const { data: roleRows, error: roleError } = await this.table("user_roles")
        .select("role_key")
        .eq("user_id", userId)
        .eq("tenant_id", tid);
      if (roleError) throw new Error(roleError.message);
      const roles = ((roleRows as Array<{ role_key: string }> | null) ?? []).map((r) => r.role_key);
      tenants.push({ tenant_id: tt.id, tenant_type: tt.type, tenant_name: tt.name, roles });
    }

    const { data: driverRow, error: driverError } = await this.table("tow_drivers")
      .select("id, tow_company_id, is_online, status")
      .eq("user_id", userId)
      .maybeSingle();
    if (driverError) throw new Error(driverError.message);
    const driver = driverRow
      ? {
          driver_id: (driverRow as { id: string }).id,
          tow_company_id: (driverRow as { tow_company_id: string }).tow_company_id,
          is_online: (driverRow as { is_online: boolean }).is_online,
          status: (driverRow as { status: string }).status,
        }
      : null;

    const { count: vehicleCount, error: vehicleCountError } = await this.table("vehicles")
      .select("id", { count: "exact", head: true } as never)
      .eq("owner_user_id", userId);
    if (vehicleCountError) throw new Error(vehicleCountError.message);
    const { count: incidentCount, error: incidentCountError } = await this.table("incidents")
      .select("id", { count: "exact", head: true } as never)
      .eq("customer_user_id", userId);
    if (incidentCountError) throw new Error(incidentCountError.message);
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
    await this.ensureCustomerShare(row);
  }

  async ensureCustomerShare(row: Record<string, unknown>): Promise<{ id: string }> {
    const { data, error } = await this.table("tow_job_customer_shares")
      .upsert(row as never, { onConflict: "tow_job_id,driver_id" } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string };
  }

  async getCustomerShare(jobId: string, driverId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.table("tow_job_customer_shares")
      .select("id")
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null) ?? null;
  }

  async addEtaSnapshot(row: Record<string, unknown>) {
    const { error } = await this.table("tow_job_eta_snapshots").insert(row as never);
    if (error) throw new Error(error.message);
  }
  async getLatestEta(jobId: string): Promise<EtaSnapshotRecord | null> {
    const { data, error } = await this.table("tow_job_eta_snapshots")
      .select("*")
      .eq("tow_job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as EtaSnapshotRecord | null) ?? null;
  }

  async createCompletionReport(row: Record<string, unknown>) {
    const { error } = await this.table("tow_job_completion_reports").insert(row as never);
    if (error) throw new Error(error.message);
  }
  async createInvoice(row: Record<string, unknown>) {
    const { error } = await this.table("tow_job_invoices").insert(row as never);
    if (error) throw new Error(error.message);
  }
  async finalizeTowJob(
    jobId: string,
    driverId: string,
    report: Record<string, unknown>,
    invoice: Record<string, unknown>,
  ): Promise<{ status: string; total_minor: number; already_finalized: boolean }> {
    const { data, error } = await this.db.rpc("finalize_tow_job" as never, {
      p_job: jobId,
      p_driver: driverId,
      p_report: report,
      p_invoice: invoice,
    } as never);
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Tow job finalization returned no result");
    return {
      status: String((row as { job_status?: string; status?: string }).job_status ?? (row as { status?: string }).status ?? "invoiced"),
      total_minor: Number((row as { total_minor?: number }).total_minor ?? 0),
      already_finalized: Boolean((row as { already_finalized?: boolean }).already_finalized),
    };
  }
  async getDriverIdForUser(userId: string): Promise<string | null> {
    const { data, error } = await this.table("tow_drivers").select("id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id ?? null;
  }

  async findIdempotentResponse(scope: string, action: string, key: string) {
    const { data, error } = await this.table("request_idempotency_keys")
      .select("resource_id, response")
      .eq("scope", scope)
      .eq("action", action)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { resource_id: string | null; response: unknown } | null) ?? null;
  }
  async storeIdempotentResponse(
    scope: string,
    action: string,
    key: string,
    resourceId: string | null,
    response: unknown,
  ): Promise<void> {
    const { error } = await this.table("request_idempotency_keys").upsert(
      {
        scope,
        action,
        idempotency_key: key,
        resource_id: resourceId,
        response,
      } as never,
      { onConflict: "scope,action,idempotency_key", ignoreDuplicates: true } as never,
    );
    if (error) throw new Error(error.message);
  }
}
