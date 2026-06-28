import { getServiceClient } from "@roadside/web-kit/server";

type Row = Record<string, unknown>;

async function selectAll(table: string, tenantId: string, limit = 200): Promise<Row[]> {
  const db = getServiceClient();
  if (!db) return [];
  const { data } = await db
    .from(table as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .limit(limit);
  return (data as Row[] | null) ?? [];
}

export async function listIncidents(tenantId: string, query?: string): Promise<Row[]> {
  const db = getServiceClient();
  if (!db) return [];
  let q = db.from("incidents" as never).select("*").eq("tenant_id", tenantId);
  if (query) {
    // search by case number (registration / customer search handled server-side
    // in production via joins; case number covers the common path here)
    q = q.ilike("case_number", `%${query}%`);
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(200);
  return (data as Row[] | null) ?? [];
}

export async function getIncident(tenantId: string, id: string): Promise<Row | null> {
  const db = getServiceClient();
  if (!db) return null;
  const { data } = await db
    .from("incidents" as never)
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getIncidentEvidence(incidentId: string): Promise<Row[]> {
  const db = getServiceClient();
  if (!db) return [];
  const { data } = await db.from("incident_evidence" as never).select("*").eq("incident_id", incidentId);
  return (data as Row[] | null) ?? [];
}

export async function getBankidStatus(incidentId: string): Promise<{ verified: boolean }> {
  const db = getServiceClient();
  if (!db) return { verified: false };
  const { data } = await db
    .from("bankid_signatures" as never)
    .select("id")
    .eq("incident_id", incidentId)
    .limit(1);
  return { verified: ((data as unknown[] | null) ?? []).length > 0 };
}

export async function getIncidentTowJob(incidentId: string): Promise<Row | null> {
  const db = getServiceClient();
  if (!db) return null;
  const { data } = await db.from("tow_jobs" as never).select("*").eq("incident_id", incidentId).maybeSingle();
  return (data as Row | null) ?? null;
}

export async function getLatestEta(towJobId: string): Promise<Row | null> {
  const db = getServiceClient();
  if (!db) return null;
  const { data } = await db
    .from("tow_job_eta_snapshots" as never)
    .select("*")
    .eq("tow_job_id", towJobId)
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
  const db = getServiceClient();
  if (!db) return null;
  const { data } = await db.from("tenant_settings" as never).select("*").eq("tenant_id", tenantId).maybeSingle();
  return (data as Row | null) ?? null;
}
