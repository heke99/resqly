import { headers } from "next/headers";
import { getServiceClient } from "@roadside/web-kit/server";
import { resolveTenant } from "@roadside/white-label";
import type { TenantThemeTokens } from "@roadside/types";

export interface ActiveTheme {
  tokens: Partial<TenantThemeTokens>;
  productName: string;
  supportPhone: string | null;
  tenantId: string | null;
}

const DEFAULT: ActiveTheme = {
  tokens: {},
  productName: "Roadside Assistance",
  supportPhone: null,
  tenantId: null,
};

/**
 * Resolve the white-label theme for the current request from the host (custom
 * domain or platform subdomain). The end customer sees the partner's brand.
 */
export async function getActiveTheme(): Promise<ActiveTheme> {
  const db = getServiceClient();
  if (!db) return DEFAULT;
  const h = await headers();
  const host = h.get("host");

  const resolution = await resolveTenant(
    { host, platformBaseDomain: process.env.PLATFORM_BASE_DOMAIN ?? null },
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

  const { data: tokens } = await db
    .from("tenant_theme_tokens" as never)
    .select("*")
    .eq("tenant_id", resolution.tenantId)
    .maybeSingle();
  const { data: branding } = await db
    .from("tenant_branding" as never)
    .select("product_name, support_phone")
    .eq("tenant_id", resolution.tenantId)
    .maybeSingle();
  const b = (branding as { product_name?: string; support_phone?: string } | null) ?? {};

  return {
    tokens: (tokens as Partial<TenantThemeTokens> | null) ?? {},
    productName: b.product_name ?? DEFAULT.productName,
    supportPhone: b.support_phone ?? null,
    tenantId: resolution.tenantId,
  };
}
