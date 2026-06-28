import { describe, expect, it } from "vitest";
import { resolveTenant, type TenantDirectory } from "./resolver";
import { buildResolvedTheme, themeToCssVars, DEFAULT_THEME_TOKENS } from "./theme";

const directory = (domains: Record<string, string>, slugs: Record<string, string>): TenantDirectory => ({
  byDomain: async (d) => domains[d] ?? null,
  bySlug: async (s) => slugs[s] ?? null,
});

describe("resolveTenant precedence", () => {
  const dir = directory(
    { "assistans.if.se": "tenant-if" },
    { partner: "tenant-partner", folksam: "tenant-folksam" },
  );

  it("resolves an exact custom domain first", async () => {
    const r = await resolveTenant({ host: "assistans.if.se", slug: "folksam" }, dir);
    expect(r).toEqual({ tenantId: "tenant-if", method: "domain" });
  });

  it("resolves a subdomain of the platform base domain", async () => {
    const r = await resolveTenant(
      { host: "partner.app.roadside.example", platformBaseDomain: "app.roadside.example" },
      dir,
    );
    expect(r).toEqual({ tenantId: "tenant-partner", method: "subdomain" });
  });

  it("ignores www and falls through to slug", async () => {
    const r = await resolveTenant(
      {
        host: "www.app.roadside.example",
        platformBaseDomain: "app.roadside.example",
        slug: "folksam",
      },
      dir,
    );
    expect(r).toEqual({ tenantId: "tenant-folksam", method: "slug" });
  });

  it("uses a deep link when host/slug do not resolve", async () => {
    const r = await resolveTenant({ deepLinkTenantId: "tenant-x" }, dir);
    expect(r).toEqual({ tenantId: "tenant-x", method: "deep_link" });
  });

  it("falls back to the saved insurance connection last", async () => {
    const r = await resolveTenant({ savedInsuranceTenantId: "tenant-saved" }, dir);
    expect(r).toEqual({ tenantId: "tenant-saved", method: "saved_connection" });
  });

  it("returns null when nothing matches (no guessing / no leakage)", async () => {
    const r = await resolveTenant({ host: "unknown.example", slug: "nope" }, dir);
    expect(r).toBeNull();
  });
});

describe("theme building", () => {
  it("uses tenant name as product name when branding is absent and applies defaults", () => {
    const theme = buildResolvedTheme({
      tenant: { id: "t1", slug: "if", name: "If Försäkring" },
    });
    expect(theme.product_name).toBe("If Försäkring");
    expect(theme.tokens.color_primary).toBe(DEFAULT_THEME_TOKENS.color_primary);
  });

  it("overrides defaults with provided tokens and branding", () => {
    const theme = buildResolvedTheme({
      tenant: { id: "t1", slug: "if", name: "If" },
      branding: { tenant_id: "t1", product_name: "If Roadside" },
      tokens: { tenant_id: "t1", color_primary: "#FF0000" } as never,
    });
    expect(theme.product_name).toBe("If Roadside");
    expect(theme.tokens.color_primary).toBe("#FF0000");
  });

  it("maps tokens to css variables", () => {
    const vars = themeToCssVars({ tenant_id: "t1", ...DEFAULT_THEME_TOKENS });
    expect(vars["--rs-color-primary"]).toBe(DEFAULT_THEME_TOKENS.color_primary);
    expect(vars["--rs-radius-base"]).toBe("12px");
  });
});
