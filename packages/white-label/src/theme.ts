import type {
  ResolvedTheme,
  Tenant,
  TenantBranding,
  TenantThemeTokens,
} from "@resqly/types";

export const DEFAULT_THEME_TOKENS: Omit<TenantThemeTokens, "tenant_id"> = {
  color_primary: "#0B5FFF",
  color_on_primary: "#FFFFFF",
  color_secondary: "#1F2937",
  color_background: "#FFFFFF",
  color_surface: "#F5F7FA",
  color_text: "#0B1324",
  color_danger: "#D92D20",
  color_success: "#12B76A",
  radius_base: 12,
  font_family: "Inter, system-ui, sans-serif",
};

export interface BuildThemeInput {
  tenant: Pick<Tenant, "id" | "slug" | "name">;
  branding?: Partial<TenantBranding> | null;
  tokens?: Partial<TenantThemeTokens> | null;
}

export function buildResolvedTheme(input: BuildThemeInput): ResolvedTheme {
  const tokens: TenantThemeTokens = {
    tenant_id: input.tenant.id,
    ...DEFAULT_THEME_TOKENS,
    ...(input.tokens ?? {}),
  };
  return {
    tenant_id: input.tenant.id,
    tenant_slug: input.tenant.slug,
    product_name: input.branding?.product_name ?? input.tenant.name,
    branding: { tenant_id: input.tenant.id, ...(input.branding ?? {}) },
    tokens,
  };
}

/** Map theme tokens to CSS custom properties for the web apps. */
export function themeToCssVars(tokens: TenantThemeTokens): Record<string, string> {
  return {
    "--rs-color-primary": tokens.color_primary,
    "--rs-color-on-primary": tokens.color_on_primary,
    "--rs-color-secondary": tokens.color_secondary,
    "--rs-color-background": tokens.color_background,
    "--rs-color-surface": tokens.color_surface,
    "--rs-color-text": tokens.color_text,
    "--rs-color-danger": tokens.color_danger,
    "--rs-color-success": tokens.color_success,
    "--rs-radius-base": `${tokens.radius_base}px`,
    "--rs-font-family": tokens.font_family,
  };
}

/** Inline style string usable on a root element in SSR. */
export function themeToStyleString(tokens: TenantThemeTokens): string {
  return Object.entries(themeToCssVars(tokens))
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}
