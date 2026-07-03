import { DEFAULT_THEME_TOKENS } from "@resqly/white-label";
import { customerApiBase } from "./api";

export interface Branding {
  tenantId: string | null;
  productName: string;
  supportPhone: string | null;
  tokens: {
    primary: string;
    onPrimary: string;
    background: string;
    surface: string;
    text: string;
  };
}

export const DEFAULT_BRANDING: Branding = {
  tenantId: null,
  productName: "Resqly",
  supportPhone: null,
  tokens: {
    primary: DEFAULT_THEME_TOKENS.color_primary,
    onPrimary: DEFAULT_THEME_TOKENS.color_on_primary,
    background: DEFAULT_THEME_TOKENS.color_background,
    surface: DEFAULT_THEME_TOKENS.color_surface,
    text: DEFAULT_THEME_TOKENS.color_text,
  },
};

/**
 * Fetch the white-label branding for the customer's active insurance context
 * (resolved server-side; only public-safe fields). Falls back to defaults
 * when unavailable so the app never crashes on missing branding.
 */
export async function fetchBrandingForTenant(tenantId: string): Promise<Branding> {
  const base = customerApiBase();
  if (!base) return DEFAULT_BRANDING;
  try {
    const res = await fetch(`${base}/api/customer/branding?tenant=${encodeURIComponent(tenantId)}`);
    if (!res.ok) return DEFAULT_BRANDING;
    const json = (await res.json()) as {
      branding?: {
        tenant_id?: string;
        product_name?: string;
        support_phone?: string | null;
        tokens?: Record<string, string>;
      } | null;
    };
    const b = json.branding;
    if (!b) return DEFAULT_BRANDING;
    return {
      tenantId: b.tenant_id ?? tenantId,
      productName: b.product_name ?? DEFAULT_BRANDING.productName,
      supportPhone: b.support_phone ?? null,
      tokens: {
        primary: b.tokens?.color_primary ?? DEFAULT_BRANDING.tokens.primary,
        onPrimary: b.tokens?.color_on_primary ?? DEFAULT_BRANDING.tokens.onPrimary,
        background: b.tokens?.color_background ?? DEFAULT_BRANDING.tokens.background,
        surface: b.tokens?.color_surface ?? DEFAULT_BRANDING.tokens.surface,
        text: b.tokens?.color_text ?? DEFAULT_BRANDING.tokens.text,
      },
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}
