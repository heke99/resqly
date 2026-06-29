import type {
  Coordinate,
  IncidentStatus,
  IncidentType,
  TowJobStatus,
} from "@resqly/types";
import type { DispatchCandidate } from "@resqly/dispatch";

export interface ApiClientRecord {
  id: string;
  tenantId: string;
  active: boolean;
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  case_number_prefix: string;
}

export interface TenantSettingsRecord {
  default_dispatch_strategy: string;
  bankid_required_for_claims: boolean;
  bankid_required_for_tow: boolean;
  max_dispatch_radius_km: number;
  max_dispatch_candidates: number;
  offer_expiry_seconds: number;
  allow_marketplace_fallback: boolean;
}

export interface IncidentRecord {
  id: string;
  tenant_id: string;
  case_number: string | null;
  customer_user_id: string;
  vehicle_id: string | null;
  insurance_company_id: string | null;
  type: IncidentType;
  status: IncidentStatus;
  requires_bankid: boolean;
  bankid_verified: boolean;
  problem_type: string | null;
  damage_type: string | null;
  description: string | null;
}

export interface TowJobRecord {
  id: string;
  tenant_id: string;
  incident_id: string;
  tow_company_id: string | null;
  driver_id: string | null;
  status: TowJobStatus;
  payer_type: string;
  priority: string;
}

export interface CustomerContact {
  name: string;
  phone: string;
  email: string | null;
  registration_number: string;
  problem_summary: string;
  pickup: Coordinate;
  pickup_address: string | null;
  destination_address: string | null;
  customer_notes: string | null;
}

export interface EtaSnapshotRecord {
  tow_job_id: string;
  driver_id: string | null;
  eta_seconds: number;
  distance_meters: number;
  source: string;
  degraded: boolean;
  created_at: string;
}

export interface DriverProfileRecord {
  id: string;
  tenant_id: string;
  tow_company_id: string;
  user_id: string | null;
  full_name: string;
  is_online: boolean;
  status: string;
  duty_status: string;
}

export interface OfferRecord {
  id: string;
  tow_job_id: string;
  driver_id: string;
  tow_company_id: string;
  tenant_id: string;
  status: string;
  rank: number;
  expires_at: string;
}

export interface DispatchCandidateOptions {
  payerType: string;
  insuranceTenantId?: string | null;
}

export interface AcceptOfferResult {
  accepted: boolean;
  towCompanyId: string | null;
  reason: string | null;
}

export interface RoleContextTenant {
  tenant_id: string;
  tenant_type: string;
  tenant_name: string;
  roles: string[];
}

export interface RoleContext {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_platform_admin: boolean;
  is_customer: boolean;
  driver: { driver_id: string; tow_company_id: string; is_online: boolean; status: string } | null;
  tenants: RoleContextTenant[];
  capabilities: {
    customer: boolean;
    driver: boolean;
    insurance_admin: boolean;
    tow_admin: boolean;
    tenant_user: boolean;
    superadmin: boolean;
  };
}

export interface DriverDeviceRecord {
  expo_push_token: string;
  platform: string;
}

/**
 * Persistence boundary for the API. The in-memory implementation backs tests;
 * the Supabase implementation backs production. Keeping handlers behind this
 * interface makes the request pipeline fully unit-testable without a database.
 */
export interface ApiRepo {
  findApiClientByKeyHash(hash: string): Promise<ApiClientRecord | null>;
  logApiRequest(row: {
    tenant_id: string | null;
    api_client_id: string | null;
    request_id: string;
    method: string;
    path: string;
    status_code: number;
  }): Promise<void>;
  recordAudit(row: Record<string, unknown>): Promise<void>;

  getTenant(tenantId: string): Promise<TenantRecord | null>;
  getTenantSettings(tenantId: string): Promise<TenantSettingsRecord>;
  getTenantBranding(tenantId: string): Promise<Record<string, unknown> | null>;
  getTenantThemeTokens(tenantId: string): Promise<Record<string, unknown> | null>;
  updateTenantBranding(tenantId: string, patch: Record<string, unknown>): Promise<void>;
  updateTenantSettings(tenantId: string, patch: Record<string, unknown>): Promise<void>;

  allocateCaseNumber(tenantId: string, scope: string): Promise<string>;

  createIncident(row: Record<string, unknown>): Promise<IncidentRecord>;
  getIncident(tenantId: string, id: string): Promise<IncidentRecord | null>;
  setIncidentStatus(id: string, status: IncidentStatus): Promise<void>;
  setIncidentBankidVerified(id: string): Promise<void>;
  addEvidence(row: Record<string, unknown>): Promise<{ id: string }>;
  recordBankidSignature(row: Record<string, unknown>): Promise<{ id: string }>;
  getCustomerContact(incidentId: string): Promise<CustomerContact | null>;

  createTowJob(row: Record<string, unknown>): Promise<TowJobRecord>;
  getTowJob(tenantId: string, id: string): Promise<TowJobRecord | null>;
  listTowJobs(tenantId: string, opts: { status?: string; limit: number }): Promise<TowJobRecord[]>;
  setTowJobStatus(id: string, status: TowJobStatus): Promise<void>;
  addTowJobStatusEvent(row: Record<string, unknown>): Promise<void>;
  assignTowJob(id: string, driverId: string, towCompanyId: string): Promise<void>;
  createOffers(rows: Array<Record<string, unknown>>): Promise<void>;
  getOfferForDriver(jobId: string, driverId: string): Promise<{ status: string } | null>;
  setOfferStatus(jobId: string, driverId: string, status: string): Promise<void>;

  /**
   * Race-safe offer acceptance. Locks the job, accepts the driver's pending
   * offer, cancels the rest, and assigns the job atomically.
   */
  acceptOffer(jobId: string, driverId: string): Promise<AcceptOfferResult>;
  getOfferById(id: string): Promise<OfferRecord | null>;
  rejectOffer(jobId: string, driverId: string, reason: string | null): Promise<void>;

  /** Driver self-service. */
  getDriverProfile(driverId: string): Promise<DriverProfileRecord | null>;
  setDriverOnline(driverId: string, online: boolean): Promise<void>;
  updateDriverLocation(driverId: string, lat: number, lng: number): Promise<void>;
  upsertDriverDevice(
    driverId: string,
    userId: string,
    device: { expo_push_token: string; platform: string; device_name?: string | null },
  ): Promise<void>;
  listDriverOffers(driverId: string): Promise<
    Array<{
      offer_id: string;
      tow_job_id: string;
      status: string;
      rank: number;
      expires_at: string;
      priority: string;
      payer_type: string;
      problem_type: string | null;
      approx_area: string | null;
      distance_meters: number | null;
    }>
  >;
  listDriverDevices(driverId: string): Promise<DriverDeviceRecord[]>;
  markOfferPush(jobId: string, driverId: string, status: string, error?: string | null): Promise<void>;

  /** Aggregate role/capability context for a user across all apps. */
  loadRoleContext(userId: string): Promise<RoleContext | null>;

  /**
   * Driver candidates near a pickup point that are also eligible for the case
   * (active insurance agreement for insurance jobs, marketplace-enabled for
   * direct jobs). Already PostGIS rough-filtered and online-only.
   */
  getDispatchCandidates(
    pickup: Coordinate,
    radiusKm: number,
    limit: number,
    opts: DispatchCandidateOptions,
  ): Promise<DispatchCandidate[]>;

  createCustomerShare(row: Record<string, unknown>): Promise<void>;

  addEtaSnapshot(row: Record<string, unknown>): Promise<void>;
  getLatestEta(jobId: string): Promise<EtaSnapshotRecord | null>;

  createCompletionReport(row: Record<string, unknown>): Promise<void>;
  createInvoice(row: Record<string, unknown>): Promise<void>;

  /** Resolve the driver record id for an authenticated driver user (if any). */
  getDriverIdForUser(userId: string): Promise<string | null>;
}
