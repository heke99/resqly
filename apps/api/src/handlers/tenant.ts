import { tenantBrandingPatchSchema, tenantSettingsPatchSchema } from "@resqly/types";
import { notFound } from "@resqly/utils";
import { buildResolvedTheme, DEFAULT_THEME_TOKENS } from "@resqly/white-label";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";

export async function getTenantTheme(ctx: ApiContext): Promise<RouteResult> {
  const tenant = await ctx.repo.getTenant(ctx.tenantId);
  if (!tenant) throw notFound("Tenant not found");
  const branding = (await ctx.repo.getTenantBranding(ctx.tenantId)) ?? {};
  const tokens = (await ctx.repo.getTenantThemeTokens(ctx.tenantId)) ?? {};
  const theme = buildResolvedTheme({
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    branding: { tenant_id: tenant.id, ...branding },
    tokens: { tenant_id: tenant.id, ...DEFAULT_THEME_TOKENS, ...tokens },
  });
  return { status: 200, body: theme };
}

export async function patchTenantBranding(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const patch = tenantBrandingPatchSchema.parse(body);
  const { color_primary, color_secondary, ...branding } = patch;
  if (Object.keys(branding).length > 0) {
    await ctx.repo.updateTenantBranding(ctx.tenantId, branding);
  }
  const tokenPatch: Record<string, unknown> = {};
  if (color_primary) tokenPatch.color_primary = color_primary;
  if (color_secondary) tokenPatch.color_secondary = color_secondary;
  // (theme tokens stored alongside branding in the memory repo for simplicity)
  if (Object.keys(tokenPatch).length > 0) {
    await ctx.repo.updateTenantBranding(ctx.tenantId, tokenPatch);
  }
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "update",
    entity_type: "tenant_branding",
    entity_id: ctx.tenantId,
    fields: Object.keys(patch),
  });
  return { status: 200, body: { updated: true } };
}

export async function getTenantSettings(ctx: ApiContext): Promise<RouteResult> {
  const settings = await ctx.repo.getTenantSettings(ctx.tenantId);
  return { status: 200, body: settings };
}

export async function patchTenantSettings(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const patch = tenantSettingsPatchSchema.parse(body);
  await ctx.repo.updateTenantSettings(ctx.tenantId, patch);
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "update",
    entity_type: "tenant_settings",
    entity_id: ctx.tenantId,
    fields: Object.keys(patch),
  });
  return { status: 200, body: { updated: true } };
}
