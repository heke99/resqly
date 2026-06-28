import { describe, expect, it } from "vitest";
import { buildAuditRow, buildCustomerShareAudit } from "./index";

describe("buildAuditRow", () => {
  it("defaults optional fields", () => {
    const row = buildAuditRow({ action: "create", entityType: "incident" });
    expect(row.fields).toEqual([]);
    expect(row.tenant_id).toBeNull();
    expect(row.action).toBe("create");
  });
});

describe("buildCustomerShareAudit", () => {
  it("records the shared fields, driver and reason as a data_share action", () => {
    const row = buildCustomerShareAudit({
      tenantId: "t1",
      driverId: "d1",
      towJobId: "j1",
      fields: ["customer_name", "customer_phone"],
      reason: "driver accepted job",
    });
    expect(row.action).toBe("data_share");
    expect(row.entity_type).toBe("tow_job_customer_share");
    expect(row.fields).toContain("customer_phone");
    expect(row.metadata).toEqual({ driver_id: "d1" });
    // never records the personal number / bankid fields
    expect(row.fields).not.toContain("personal_number");
  });
});
