import { getServiceClient } from "@roadside/web-kit/server";

export interface TenantRow {
  id: string;
  type: string;
  name: string;
  slug: string;
  status: string;
  case_number_prefix: string;
  created_at: string;
}

export async function listTenants(): Promise<TenantRow[]> {
  const db = getServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("tenants" as never)
    .select("*")
    .order("created_at", { ascending: false });
  return (data as TenantRow[] | null) ?? [];
}

export async function getTenant(id: string): Promise<TenantRow | null> {
  const db = getServiceClient();
  if (!db) return null;
  const { data } = await db.from("tenants" as never).select("*").eq("id", id).maybeSingle();
  return (data as TenantRow | null) ?? null;
}

export async function listAuditLogs(): Promise<Array<Record<string, unknown>>> {
  const db = getServiceClient();
  if (!db) return [];
  const { data } = await db
    .from("audit_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}
