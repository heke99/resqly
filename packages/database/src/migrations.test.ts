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

  it("adds driver operational fields, devices and offer lifecycle columns", () => {
    expect(sql).toContain("add column if not exists is_online boolean");
    expect(sql).toContain("create table if not exists public.driver_devices");
    expect(sql).toContain("expo_push_token");
    expect(sql).toContain("add column if not exists accepted_at");
    expect(sql).toContain("add column if not exists rejection_reason");
  });

  it("adds agreement and marketplace tables that drive dispatch eligibility", () => {
    expect(sql).toContain("create table if not exists public.tow_company_insurance_agreements");
    expect(sql).toContain("create table if not exists public.tow_company_marketplace_settings");
    expect(sql).toContain("accepts_direct_orders");
    expect(sql).toContain("insurance_tenant_id");
  });

  it("defines all six statistics views as security_invoker", () => {
    for (const view of [
      "insurance_dashboard_stats",
      "tow_company_dashboard_stats",
      "superadmin_platform_stats",
      "driver_performance_stats",
      "tow_company_performance_stats",
      "insurance_partner_performance_stats",
    ]) {
      expect(sql).toContain(`create or replace view public.${view}`);
    }
    expect(sql).toContain("security_invoker = on");
  });

  it("enforces dispatch eligibility (agreement vs marketplace) in the candidate RPC", () => {
    expect(sql).toContain("function public.dispatch_eligible_candidates");
    expect(sql).toContain("public.tow_company_insurance_agreements a");
    expect(sql).toContain("public.tow_company_marketplace_settings m");
    expect(sql).toContain("m.accepts_direct_orders = true");
  });

  it("accepts offers race-safely with a row lock", () => {
    expect(sql).toContain("function public.accept_tow_offer");
    expect(sql).toContain("for update");
    expect(sql).toContain("on conflict (tow_job_id) do nothing");
  });
});

describe("production hardening (0020)", () => {
  const sql = readFileSync(join(migrationsDir, "0020_production_hardening.sql"), "utf8");

  it("supports the full agreement lifecycle", () => {
    for (const status of ["draft", "pending", "active", "paused", "suspended", "expired", "terminated"]) {
      expect(sql).toContain(`'${status}'`);
    }
  });

  it("rejects expired offers in accept_tow_offer", () => {
    expect(sql).toContain("offer_expired");
    expect(sql).toMatch(/expires_at is not null and v_offer\.expires_at < now\(\)/);
  });

  it("is idempotent when the winning driver retries accept", () => {
    expect(sql).toContain("already_accepted_by_driver");
  });

  it("locks the staging demo seed away from client roles", () => {
    expect(sql).toContain("revoke execute on function public.create_resqly_staging_demo() from anon");
    expect(sql).toContain("revoke execute on function public.create_resqly_staging_demo() from authenticated");
    expect(sql).toMatch(/if auth\.uid\(\) is not null and not public\.is_platform_admin\(\)/);
  });

  it("locks dispatch candidates and case-number allocation to the service role", () => {
    expect(sql).toMatch(/revoke execute on function public\.dispatch_eligible_candidates[\s\S]*from authenticated/);
    expect(sql).toContain("revoke execute on function public.allocate_case_number(uuid, text) from authenticated");
    expect(sql).toContain("grant execute on function public.allocate_case_number(uuid, text) to service_role");
  });

  it("guarantees one live tow job per incident", () => {
    expect(sql).toContain("uq_tow_jobs_active_incident");
    expect(sql).toContain("status not in ('cancelled', 'failed', 'closed')");
  });

  it("adds the idempotency key table without client policies", () => {
    expect(sql).toContain("create table if not exists public.request_idempotency_keys");
    expect(sql).toContain("unique (scope, action, idempotency_key)");
    expect(sql).toMatch(/request_idempotency_keys enable row level security/);
  });

  it("seeds the agreements.manage permission referenced by 0018 RLS", () => {
    expect(sql).toContain("'agreements.manage'");
    expect(sql).toContain("('insurance_owner_admin', 'agreements.manage')");
  });

  it("adds a tow company readiness view with Swedish blockers", () => {
    expect(sql).toContain("create or replace view public.tow_company_production_readiness");
    expect(sql).toContain("security_invoker = on");
    expect(sql).toContain("ready_for_live_operation");
    expect(sql).toContain("Saknar aktiv bärgningsbil");
  });
});
