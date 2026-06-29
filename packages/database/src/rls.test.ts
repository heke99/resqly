import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mig = (name: string) =>
  readFileSync(join(here, "..", "supabase", "migrations", name), "utf8");

describe("RLS migration (0007)", () => {
  const sql = mig("0007_rls.sql");

  it("enables and forces RLS on all public tables", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
  });

  it("protects customer contact data behind the driver link only", () => {
    expect(sql).toContain("create policy customer_shares_read on public.tow_job_customer_shares");
    // driver branch checks the driver belongs to the current user
    expect(sql).toMatch(/tow_drivers d[\s\S]*d\.user_id = auth\.uid\(\)/);
  });

  it("restricts BankID tables to the owner / platform admin", () => {
    expect(sql).toContain("bankid_signatures_owner");
    expect(sql).toContain("bankid_sessions_owner");
    // the bankid_signatures policy line itself only checks owner / platform admin
    const sigPolicy = sql
      .split("\n")
      .find((l) => l.includes("bankid_signatures_owner"));
    const sigUsing = sql.slice(sql.indexOf("bankid_signatures_owner"));
    expect(sigPolicy).toBeDefined();
    expect(sigUsing.slice(0, 200)).toContain("user_id = auth.uid()");
    expect(sigUsing.slice(0, 200)).not.toContain("tow_company");
  });

  it("does not grant drivers or tow companies direct incident reads", () => {
    const incidentsPolicy = sql.slice(
      sql.indexOf("incidents_read"),
      sql.indexOf("incidents_customer_write"),
    );
    expect(incidentsPolicy).not.toContain("is_tow_company_member");
    expect(incidentsPolicy).not.toContain("is_assigned_driver_for_job");
  });
});

describe("Driver ops & agreements RLS (0011/0012/0014)", () => {
  const sql = mig("0011_driver_ops.sql") + "\n" + mig("0012_agreements_marketplace.sql") + "\n" + mig("0014_dispatch_rpc_rls.sql");

  it("forces RLS on the new tables", () => {
    expect(sql).toContain("alter table public.driver_devices enable row level security");
    expect(sql).toContain("alter table public.tow_company_insurance_agreements enable row level security");
    expect(sql).toContain("alter table public.tow_company_marketplace_settings enable row level security");
  });

  it("scopes driver devices to the owning user", () => {
    expect(sql).toContain("create policy driver_devices_owner_read on public.driver_devices");
    expect(sql).toMatch(/driver_devices[\s\S]*user_id = auth\.uid\(\)/);
  });

  it("lets the customer read only their own tow job status (no PII columns on the row)", () => {
    expect(sql).toContain("create policy tow_jobs_customer_read on public.tow_jobs");
    expect(sql).toMatch(/tow_jobs_customer_read[\s\S]*customer_user_id = auth\.uid\(\)/);
  });

  it("requires driver ownership to accept via JWT (defense in depth)", () => {
    expect(sql).toMatch(/accept_tow_offer[\s\S]*tow_drivers where id = p_driver and user_id = auth\.uid\(\)/);
  });
});

describe("Storage policies (0008)", () => {
  const sql = mig("0008_storage.sql");
  it("creates the three buckets", () => {
    expect(sql).toContain("'incident-evidence'");
    expect(sql).toContain("'tow-evidence'");
    expect(sql).toContain("'tenant-assets'");
  });
  it("restricts tow evidence writes to the assigned driver", () => {
    expect(sql).toContain("is_assigned_driver_for_job(tj.id)");
  });
});
