import { headers } from "next/headers";
import { getServiceClient } from "@resqly/web-kit/server";
import { resolveTenant } from "@resqly/white-label";
import type { TenantThemeTokens } from "@resqly/types";

export interface ActiveTheme {
  tokens: Partial<TenantThemeTokens>;
  productName: string;
  supportPhone: string | null;
  supportEmail: string | null;
  supportUrl: string | null;
  logoUrl: string | null;
  tenantId: string | null;
  slug: string | null;
  method: string | null;
}

const DEFAULT: ActiveTheme = {
  tokens: {},
  productName: "Resqly",
  supportPhone: null,
  supportEmail: null,
  supportUrl: null,
  logoUrl: null,
  tenantId: null,
  slug: null,
  method: null,
};

async function loadTheme(tenantId: string, method: string): Promise<ActiveTheme> {
  const db = getServiceClient();
  if (!db) return DEFAULT;
  const [tokens, branding, tenant] = await Promise.all([
    db.from("tenant_theme_tokens" as never).select("*").eq("tenant_id", tenantId).maybeSingle(),
    db
      .from("tenant_branding" as never)
      .select("product_name, support_phone, support_email, support_url, logo_url")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    db.from("tenants" as never).select("slug, name").eq("id", tenantId).maybeSingle(),
  ]);
  const b = (branding.data as { product_name?: string; support_phone?: string; support_email?: string; support_url?: string; logo_url?: string } | null) ?? {};
  const t = (tenant.data as { slug?: string; name?: string } | null) ?? {};

  return {
    tokens: (tokens.data as Partial<TenantThemeTokens> | null) ?? {},
    productName: b.product_name ?? t.name ?? DEFAULT.productName,
    supportPhone: b.support_phone ?? null,
    supportEmail: b.support_email ?? null,
    supportUrl: b.support_url ?? null,
    logoUrl: b.logo_url ?? null,
    tenantId,
    slug: t.slug ?? null,
    method,
  };
}

/**
 * Resolve white-label for the request. Domain/subdomain is still supported,
 * but app.resqly.com can also carry a partner slug via middleware header from:
 *   /partner/[slug]
 *   /start?partner=[slug]
 *   /?partner=[slug]
 * The final tenant for case creation is still derived from selected vehicle policy.
 */
export async function getActiveTheme(explicitSlug?: string | null): Promise<ActiveTheme> {
  const db = getServiceClient();
  if (!db) return DEFAULT;
  const h = await headers();
  const host = h.get("host");
  const partnerSlug = explicitSlug ?? h.get("x-resqly-partner-slug");

  const resolution = await resolveTenant(
    { host, slug: partnerSlug, platformBaseDomain: process.env.PLATFORM_BASE_DOMAIN ?? null },
    {
      byDomain: async (domain) => {
        const { data } = await db
          .from("tenant_domains" as never)
          .select("tenant_id")
          .eq("domain", domain)
          .maybeSingle();
        return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
      },
      bySlug: async (slug) => {
        const { data } = await db.from("tenants" as never).select("id").eq("slug", slug).maybeSingle();
        return (data as { id?: string } | null)?.id ?? null;
      },
    },
  );
  if (!resolution) return DEFAULT;
  return loadTheme(resolution.tenantId, resolution.method);
}
