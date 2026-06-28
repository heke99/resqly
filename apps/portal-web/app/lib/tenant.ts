import { getServiceClient } from "@roadside/web-kit/server";

export interface PortalTenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  case_number_prefix: string;
}

export async function listPortalTenants(): Promise<PortalTenant[]> {
  const db = getServiceClient();
  if (!db) return [];
  const { data } = await db.from("tenants" as never).select("id, name, slug, type, case_number_prefix");
  return (data as PortalTenant[] | null) ?? [];
}

/**
 * Resolve the active tenant for the portal. In production this comes from the
 * authenticated user's session; here we accept ?tenant=<id> and otherwise fall
 * back to the first tenant (or null on an empty system).
 */
export async function getActiveTenant(
  search?: Record<string, string | string[] | undefined>,
): Promise<PortalTenant | null> {
  const tenants = await listPortalTenants();
  const requested = typeof search?.tenant === "string" ? search.tenant : undefined;
  if (requested) return tenants.find((t) => t.id === requested) ?? null;
  return tenants[0] ?? null;
}
