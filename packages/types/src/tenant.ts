import { z } from "zod";
import { tenantStatusSchema, tenantTypeSchema } from "./enums";
import { isoDateTimeSchema, uuidSchema } from "./common";

export const tenantSchema = z.object({
  id: uuidSchema,
  type: tenantTypeSchema,
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with dashes"),
  status: tenantStatusSchema.default("active"),
  /** Per-tenant case-number prefix, e.g. "IF", "FOLK". No hardcoded names in logic. */
  case_number_prefix: z.string().min(1).max(12),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type Tenant = z.infer<typeof tenantSchema>;

export const tenantBrandingSchema = z.object({
  tenant_id: uuidSchema,
  logo_url: z.string().url().nullable().optional(),
  logo_dark_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  support_phone: z.string().nullable().optional(),
  support_email: z.string().email().nullable().optional(),
  support_url: z.string().url().nullable().optional(),
  product_name: z.string().nullable().optional(),
});
export type TenantBranding = z.infer<typeof tenantBrandingSchema>;

/** Design tokens used to theme web + mobile from one source. */
export const tenantThemeTokensSchema = z.object({
  tenant_id: uuidSchema,
  color_primary: z.string().default("#0B5FFF"),
  color_on_primary: z.string().default("#FFFFFF"),
  color_secondary: z.string().default("#1F2937"),
  color_background: z.string().default("#FFFFFF"),
  color_surface: z.string().default("#F5F7FA"),
  color_text: z.string().default("#0B1324"),
  color_danger: z.string().default("#D92D20"),
  color_success: z.string().default("#12B76A"),
  radius_base: z.number().default(12),
  font_family: z.string().default("Inter, system-ui, sans-serif"),
});
export type TenantThemeTokens = z.infer<typeof tenantThemeTokensSchema>;

export const tenantDomainSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  domain: z.string().min(1),
  is_primary: z.boolean().default(false),
  verified: z.boolean().default(false),
});
export type TenantDomain = z.infer<typeof tenantDomainSchema>;

export const tenantSettingsSchema = z.object({
  tenant_id: uuidSchema,
  default_dispatch_strategy: z.string().default("eta_first"),
  bankid_required_for_claims: z.boolean().default(true),
  bankid_required_for_tow: z.boolean().default(true),
  max_dispatch_radius_km: z.number().positive().default(50),
  max_dispatch_candidates: z.number().int().positive().default(8),
  offer_expiry_seconds: z.number().int().positive().default(120),
  eta_refresh_seconds: z.number().int().positive().default(60),
  /** Allow private-pay cases to use the broader marketplace network. */
  allow_marketplace_fallback: z.boolean().default(true),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const tenantFeatureFlagsSchema = z.object({
  tenant_id: uuidSchema,
  damage_claims_enabled: z.boolean().default(true),
  marketplace_enabled: z.boolean().default(false),
  realtime_tracking_enabled: z.boolean().default(true),
});
export type TenantFeatureFlags = z.infer<typeof tenantFeatureFlagsSchema>;

export const tenantLegalTextSchema = z.object({
  tenant_id: uuidSchema,
  locale: z.string().default("sv-SE"),
  terms_of_service: z.string().nullable().optional(),
  privacy_policy: z.string().nullable().optional(),
});
export type TenantLegalText = z.infer<typeof tenantLegalTextSchema>;

/** Resolved theme delivered to a client to render white-label UI. */
export const resolvedThemeSchema = z.object({
  tenant_id: uuidSchema,
  tenant_slug: z.string(),
  product_name: z.string(),
  branding: tenantBrandingSchema.partial().extend({ tenant_id: uuidSchema }),
  tokens: tenantThemeTokensSchema,
});
export type ResolvedTheme = z.infer<typeof resolvedThemeSchema>;
