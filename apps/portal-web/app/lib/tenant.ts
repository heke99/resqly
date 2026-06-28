import { getPortalTenants, requirePortalTenant, type PortalTenant } from "./auth";

export type { PortalTenant };

export async function listPortalTenants(): Promise<PortalTenant[]> {
  const { tenants } = await getPortalTenants();
  return tenants;
}

/**
 * Resolve active tenant from the authenticated user's tenant memberships.
 * The optional ?tenant=<id> parameter is accepted only when the user belongs to
 * that tenant. There is no fallback to the first platform tenant.
 */
export async function getActiveTenant(
  search?: Record<string, string | string[] | undefined>,
): Promise<PortalTenant | null> {
  const requested = typeof search?.tenant === "string" ? search.tenant : undefined;
  const { tenant } = await requirePortalTenant(requested);
  return tenant;
}
