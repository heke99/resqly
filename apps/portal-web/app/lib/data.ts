import { requirePortalTenant } from "./auth";

type Row = Record<string, unknown>;

async function selectAll(table: string, tenantId: string, limit = 200): Promise<Row[]> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from(table as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(limit);
  return (data as Row[] | null) ?? [];
}

export async function listIncidents(tenantId: string, query?: string): Promise<Row[]> {
  const { db } = await requirePortalTenant(tenantId);
  let q = db.from("incidents" as never).select("*").eq("tenant_id", tenantId);
  if (query) q = q.ilike("case_number", `%${query}%`);
  const { data } = await q.order("created_at", { ascending: false }).limit(200);
  return (data as Row[] | null) ?? [];
}

export async function getIncident(tenantId: string, id: string): Promise<Row | null> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("incidents" as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getIncidentEvidence(tenantId: string, incidentId: string): Promise<Row[]> {
  const incident = await getIncident(tenantId, incidentId);
  if (!incident) return [];
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db.from("incident_evidence" as never).select("*").eq("incident_id", incidentId);
  return (data as Row[] | null) ?? [];
}

export async function getBankidStatus(tenantId: string, incidentId: string): Promise<{ verified: boolean }> {
  const incident = await getIncident(tenantId, incidentId);
  if (!incident) return { verified: false };
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("bankid_signatures" as never)
    .select("id")
    .eq("incident_id", incidentId)
    .limit(1);
  return { verified: ((data as unknown[] | null) ?? []).length > 0 };
}

export async function getIncidentTowJob(tenantId: string, incidentId: string): Promise<Row | null> {
  const incident = await getIncident(tenantId, incidentId);
  if (!incident) return null;
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_jobs" as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("incident_id", incidentId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getLatestEta(tenantId: string, towJobId: string): Promise<Row | null> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_job_eta_snapshots" as never)
    .select("tow_job_id, driver_id, eta_seconds, distance_meters, source, degraded, created_at, tow_jobs!inner(tenant_id)")
    .eq("tow_job_id", towJobId)
    .eq("tow_jobs.tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export const listTowJobs = (tenantId: string) => selectAll("tow_jobs", tenantId);
export const listDrivers = (tenantId: string) => selectAll("tow_drivers", tenantId);
export const listTowVehicles = (tenantId: string) => selectAll("tow_vehicles", tenantId);
export const listApiClients = (tenantId: string) => selectAll("tenant_api_clients", tenantId);
export const listWebhooks = (tenantId: string) => selectAll("tenant_webhooks", tenantId);

export async function getTenantSettings(tenantId: string): Promise<Row | null> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db.from("tenant_settings" as never).select("*").eq("tenant_id", tenantId).maybeSingle();
  return (data as Row | null) ?? null;
}

export interface PortalDashboardData {
  incidents: Row[];
  jobs: Row[];
  drivers: Row[];
  towVehicles: Row[];
  apiClients: Row[];
  webhooks: Row[];
}

export async function getPortalDashboardData(tenantId: string): Promise<PortalDashboardData> {
  const [incidents, jobs, drivers, towVehicles, apiClients, webhooks] = await Promise.all([
    listIncidents(tenantId),
    listTowJobs(tenantId),
    listDrivers(tenantId),
    listTowVehicles(tenantId),
    listApiClients(tenantId),
    listWebhooks(tenantId),
  ]);
  return { incidents, jobs, drivers, towVehicles, apiClients, webhooks };
}

// ---------------------------------------------------------------------------
// Tow-company scoped helpers.
//
// tow_jobs / tow_job_offers carry the INSURER tenant_id, not the tow company's
// tenant. A tow company sees its work via tow_company_id. We resolve the tow
// company id from the tenant (tow_companies has a unique tenant_id).
// ---------------------------------------------------------------------------
export async function getTowCompanyId(tenantId: string): Promise<string | null> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function byCompany(table: string, tenantId: string, limit = 200): Promise<Row[]> {
  const companyId = await getTowCompanyId(tenantId);
  if (!companyId) return [];
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from(table as never)
    .select("*")
    .eq("tow_company_id", companyId)
    .limit(limit);
  return (data as Row[] | null) ?? [];
}

export const listCompanyJobs = (tenantId: string) => byCompany("tow_jobs", tenantId);
export const listCompanyOffers = (tenantId: string) => byCompany("tow_job_offers", tenantId);
export const listCompletionReports = (tenantId: string) => byCompany("tow_job_completion_reports", tenantId);
export const listInvoices = (tenantId: string) => byCompany("tow_job_invoices", tenantId);
export const listAvailabilityWindows = (tenantId: string) => selectAll("tow_availability_windows", tenantId);

export async function listAgreements(tenantId: string): Promise<Row[]> {
  const companyId = await getTowCompanyId(tenantId);
  if (!companyId) return [];
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_company_insurance_agreements" as never)
    .select("*")
    .eq("tow_company_id", companyId)
    .order("created_at", { ascending: false });
  return (data as Row[] | null) ?? [];
}

export async function getMarketplaceSettings(tenantId: string): Promise<Row | null> {
  const companyId = await getTowCompanyId(tenantId);
  if (!companyId) return null;
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_company_marketplace_settings" as never)
    .select("*")
    .eq("tow_company_id", companyId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

// --- Damage claims / SLA / partners (insurance side) ---
export const listClaims = (tenantId: string) => selectAll("insurance_claims", tenantId);

export async function listInsuranceTowJobs(tenantId: string): Promise<Row[]> {
  // For an insurer tenant, tow_jobs.tenant_id IS the insurer tenant.
  return selectAll("tow_jobs", tenantId);
}

// --- Statistics views ---
export async function getInsuranceDashboardStats(tenantId: string): Promise<Row | null> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("insurance_dashboard_stats" as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getTowCompanyDashboardStats(tenantId: string): Promise<Row | null> {
  const companyId = await getTowCompanyId(tenantId);
  if (!companyId) return null;
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tow_company_dashboard_stats" as never)
    .select("*")
    .eq("tow_company_id", companyId)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getDriverPerformance(tenantId: string): Promise<Row[]> {
  const companyId = await getTowCompanyId(tenantId);
  if (!companyId) return [];
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("driver_performance_stats" as never)
    .select("*")
    .eq("tow_company_id", companyId);
  return (data as Row[] | null) ?? [];
}

export async function getInsurancePartnerPerformance(tenantId: string): Promise<Row[]> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("insurance_partner_performance_stats" as never)
    .select("*")
    .eq("insurance_tenant_id", tenantId);
  return (data as Row[] | null) ?? [];
}

export async function listInsuranceTenants(tenantId: string): Promise<Array<{ id: string; name: string }>> {
  const { db } = await requirePortalTenant(tenantId);
  const { data } = await db
    .from("tenants" as never)
    .select("id, name")
    .eq("type", "insurance_company")
    .order("name");
  return (data as Array<{ id: string; name: string }> | null) ?? [];
}

/** Group rows by a key into counts for breakdown charts. */
export function countBy(rows: Row[], key: string): Array<{ label: string; value: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = String(r[key] ?? "unknown");
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
