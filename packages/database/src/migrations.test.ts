import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "supabase", "migrations");

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");
}

describe("migrations", () => {
  const sql = allSql();

  it("contains the ordered core migration files", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    expect(files).toContain("0001_core_tenants_rbac.sql");
    expect(files).toContain("0004_incidents.sql");
    expect(files).toContain("0005_tow.sql");
    expect(files).toContain("0006_integrations_audit_billing_casenumbers.sql");
  });

  it("defines the race-safe case-number allocator", () => {
    expect(sql).toContain("function public.allocate_case_number");
    expect(sql).toContain("on conflict (tenant_id, year, scope)");
  });

  it("stores a personal_number_hash and never a raw personal_number column", () => {
    expect(sql).toContain("personal_number_hash");
    // No bare column declaration for an un-hashed personal number.
    expect(/\n\s*personal_number\s+text/i.test(sql)).toBe(false);
  });

  it("defines RBAC helper functions used by RLS", () => {
    expect(sql).toContain("function public.has_permission");
    expect(sql).toContain("function public.has_tenant_access");
    expect(sql).toContain("function public.is_platform_admin");
  });

  it("enables PostGIS for geodata", () => {
    expect(sql).toContain("create extension if not exists postgis");
    expect(sql).toContain("geography(Point, 4326)");
  });

  it("supports universal customer domain with vehicle-based insurance context", () => {
    expect(sql).toContain("customer_insurance_connections");
    expect(sql).toContain("idx_vip_one_active_per_vehicle");
    expect(sql).toContain("vehicle_policies_owner_write");
  });
});
