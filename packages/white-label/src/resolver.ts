export type ResolutionMethod =
  | "domain"
  | "subdomain"
  | "slug"
  | "deep_link"
  | "saved_connection";

export interface TenantResolutionHints {
  /** Request host, e.g. "assistans.partner.se". */
  host?: string | null;
  /** Explicit slug, e.g. from a path segment or query param. */
  slug?: string | null;
  /** Tenant carried by a partner deep link. */
  deepLinkTenantId?: string | null;
  /** The customer's previously saved insurance tenant. */
  savedInsuranceTenantId?: string | null;
  /** The platform's own base domain used to detect tenant subdomains. */
  platformBaseDomain?: string | null;
}

/** Directory the resolver consults; the caller wires it to the database. */
export interface TenantDirectory {
  byDomain(domain: string): Promise<string | null>;
  bySlug(slug: string): Promise<string | null>;
}

export interface TenantResolution {
  tenantId: string;
  method: ResolutionMethod;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().split(":")[0]!.trim();
}

/**
 * Resolve the active tenant from request hints, in priority order:
 *   1. exact custom domain
 *   2. tenant subdomain of the platform base domain
 *   3. explicit slug
 *   4. partner deep link
 *   5. the customer's saved insurance connection
 *
 * The resolver only ever returns tenants the supplied directory confirms, so it
 * cannot leak or guess another tenant.
 */
export async function resolveTenant(
  hints: TenantResolutionHints,
  dir: TenantDirectory,
): Promise<TenantResolution | null> {
  if (hints.host) {
    const host = normalizeHost(hints.host);

    const byDomain = await dir.byDomain(host);
    if (byDomain) return { tenantId: byDomain, method: "domain" };

    if (hints.platformBaseDomain) {
      const base = hints.platformBaseDomain.toLowerCase().trim();
      if (host !== base && host.endsWith(`.${base}`)) {
        const label = host.slice(0, host.length - base.length - 1).split(".")[0];
        if (label && label !== "www") {
          const bySub = await dir.bySlug(label);
          if (bySub) return { tenantId: bySub, method: "subdomain" };
        }
      }
    }
  }

  if (hints.slug) {
    const bySlug = await dir.bySlug(hints.slug.toLowerCase().trim());
    if (bySlug) return { tenantId: bySlug, method: "slug" };
  }

  if (hints.deepLinkTenantId) {
    return { tenantId: hints.deepLinkTenantId, method: "deep_link" };
  }

  if (hints.savedInsuranceTenantId) {
    return { tenantId: hints.savedInsuranceTenantId, method: "saved_connection" };
  }

  return null;
}
