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

describe("security hardening (0021)", () => {
  const sql = readFileSync(join(migrationsDir, "0021_security_hardening.sql"), "utf8");

  it("locks every driver-location RPC overload away from client roles", () => {
    expect(sql).toContain("p.proname = 'tow_drivers_within_radius'");
    expect(sql).toContain("'revoke execute on function %I.%I(%s) from authenticated'");
    expect(sql).toContain("'grant execute on function %I.%I(%s) to service_role'");
  });

  it("narrows the insurance company list to active insurers", () => {
    expect(sql).toContain("drop policy if exists insurance_companies_read");
    expect(sql).toContain("active = true");
  });

  it("adds storage delete policies for evidence buckets", () => {
    const compactSql = sql.replace(/\s+/g, " ");
    expect(compactSql).toContain('create policy "incident_evidence_delete" on storage.objects for delete');
    expect(compactSql).toContain('create policy "tow_evidence_delete" on storage.objects for delete');
    expect(compactSql).toContain('create policy "tenant_assets_delete" on storage.objects for delete');
  });
});

describe("notification idempotency (0024)", () => {
  const sql = readFileSync(join(migrationsDir, "0024_notification_dedupe.sql"), "utf8");

  it("enforces a unique dedupe key on notification deliveries", () => {
    expect(sql).toContain("add column if not exists dedupe_key text");
    expect(sql).toContain("uq_notification_deliveries_dedupe");
    expect(sql).toContain("where dedupe_key is not null");
  });
});

describe("tenant and actor consistency (0027)", () => {
  const sql = readFileSync(join(migrationsDir, "0027_tenant_actor_consistency.sql"), "utf8");

  it("selects exactly one explicit private marketplace operator", () => {
    expect(sql).toContain("private_marketplace_operator");
    expect(sql).toContain("uq_single_private_marketplace_operator");
    expect(sql).toContain("private_marketplace_operator_must_be_active_internal_tenant");
  });

  it("binds partner supplied references to the same tenant and company", () => {
    expect(sql).toContain("incident_vehicle_not_owned_by_customer");
    expect(sql).toContain("incident_insurance_company_wrong_tenant");
    expect(sql).toContain("tow_offer_driver_vehicle_wrong_company");
    expect(sql).toContain("tow_offer_not_covered_by_insurer_agreement");
    expect(sql).toContain("tow_job_company_not_open_for_private_orders");
    expect(sql).toContain("tow_child_driver_not_assigned_to_job");
    expect(sql).toContain("tow_invoice_payer_does_not_match_job");
  });

  it("preserves the insurer-to-tow-company cross-tenant bridge", () => {
    expect(sql).toContain("job owner tenant and executing tow-company tenant are intentionally");
    expect(sql).toContain("tow_assignment_does_not_match_job_company_driver_vehicle");
    expect(sql).not.toContain("tow_job_company_wrong_tenant");
  });

  it("records human, API client and worker actors", () => {
    expect(sql).toContain("actor_api_client_id");
    expect(sql).toContain("actor_kind");
    expect(sql).toContain("created_by_worker");
    expect(sql).toContain("actor_worker");
    expect(sql).toContain("worker_manual_review_requires_worker_name");
  });

  it("cancels an incident and all live tow work atomically", () => {
    expect(sql).toContain("function public.cancel_incident_workflow");
    expect(sql).toContain("for update");
    expect(sql).toContain("cancelled_tow_jobs");
    expect(sql).toContain("v_admin_job_statuses");
    expect(sql).toContain("tow_job_locked");
    expect(sql).toContain("grant execute on function public.cancel_incident_workflow(uuid, uuid, text, boolean) to service_role");
  });


  it("moves manual review escalation into one service-only transaction", () => {
    expect(sql).toContain("function public.escalate_tow_job_manual_review");
    expect(sql).toContain("manual_review_id");
    expect(sql).toContain("created_by_worker");
    expect(sql).toContain("status_not_reviewable");
    expect(sql).toContain("revoke all on function public.escalate_tow_job_manual_review(uuid, uuid, uuid, text, text, uuid, text, uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.escalate_tow_job_manual_review(uuid, uuid, uuid, text, text, uuid, text, uuid) to service_role");
  });

  it("keeps customer cancellation consistent with the incident status graph", () => {
    expect(sql).toContain("'received' and p_to_status = any(array['more_info_required','in_progress','rejected','cancelled','closed'])");
    expect(sql).toContain("if not public.user_can_act_for_tenant(p_actor_user, p_tenant) then");
  });

  it("transitions tow status atomically with attributed actors", () => {
    expect(sql).toContain("function public.transition_tow_job_status");
    expect(sql).toContain("stale_status");
    expect(sql).toContain("tow_job_status_events");
    expect(sql).toContain("grant execute on function public.transition_tow_job_status(uuid, text, text, uuid, uuid, text, text)");
  });

  it("limits tenant API keys to explicit validated scopes", () => {
    expect(sql).toContain("add column if not exists scopes text[]");
    expect(sql).toContain("tenant_api_clients_scopes_allowed");
    expect(sql).toContain("'tenant:write'");
    expect(sql).toContain("cardinality(scopes) > 0");
  });

  it("validates the creator and agreement parties against active tenant context", () => {
    expect(sql).toContain("creator_user_wrong_tenant");
    expect(sql).toContain("agreement_requester_wrong_tenant");
    expect(sql).toContain("agreement_decider_wrong_tenant");
    expect(sql).toContain("tow_event_user_wrong_context");
  });
});
