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
