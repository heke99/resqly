import { describe, expect, it } from "vitest";
import { towJobStatusGuard, transitionTowJob } from "./status";
import {
  SHAREABLE_CUSTOMER_FIELDS,
  buildCustomerShare,
  canShareCustomerData,
} from "./customer-share";
import { buildCompletionReport } from "./completion";

describe("tow job status machine", () => {
  it("supports the full lifecycle", () => {
    const path: Array<[Parameters<typeof transitionTowJob>[0]["from"], Parameters<typeof transitionTowJob>[0]["to"]]> = [
      ["created", "matching"],
      ["matching", "offered"],
      ["offered", "accepted"],
      ["accepted", "driver_en_route"],
      ["driver_en_route", "driver_arrived"],
      ["driver_arrived", "vehicle_loaded"],
      ["vehicle_loaded", "transporting"],
      ["transporting", "delivered"],
      ["delivered", "completed"],
      ["completed", "invoiced"],
      ["invoiced", "closed"],
    ];
    for (const [from, to] of path) {
      expect(towJobStatusGuard.canTransition(from, to)).toBe(true);
    }
  });

  it("rejects skipping states", () => {
    expect(towJobStatusGuard.canTransition("created", "completed")).toBe(false);
    expect(() => transitionTowJob({ towJobId: "j1", from: "closed", to: "matching" })).toThrow();
  });

  it("can re-offer when an offer expires and escalate to manual review", () => {
    expect(towJobStatusGuard.canTransition("offered", "matching")).toBe(true);
    expect(towJobStatusGuard.canTransition("matching", "manual_review")).toBe(true);
  });
});

describe("customer data sharing (the critical rule)", () => {
  const baseInput = {
    tenantId: "t1",
    towJobId: "j1",
    driverId: "d1",
    customer: { name: "Anna", phone: "+46700000000", email: "anna@example.com" },
    registrationNumber: "ABC123",
    problemSummary: "Dead battery",
    pickup: { lat: 59.33, lng: 18.06 },
  };

  it("NEVER shares before the job is accepted", () => {
    for (const status of ["created", "matching", "offered"] as const) {
      expect(canShareCustomerData(status)).toBe(false);
      expect(() => buildCustomerShare({ ...baseInput, jobStatus: status })).toThrow(/cannot be shared/);
    }
  });

  it("shares only after accept and only the allow-listed fields", () => {
    const row = buildCustomerShare({ ...baseInput, jobStatus: "accepted" });
    expect(row.customer_phone).toBe("+46700000000");
    expect(row.shared_fields).toEqual([...SHAREABLE_CUSTOMER_FIELDS]);
    // the allow-list must never leak personal number or bankid
    expect(row.shared_fields).not.toContain("personal_number");
    expect(Object.keys(row)).not.toContain("personal_number");
    expect(Object.keys(row)).not.toContain("bankid_status");
  });

  it("the allow-list does not contain any sensitive field", () => {
    const forbidden = ["personal_number", "personal_number_hash", "bankid", "fraud_score", "internal_notes"];
    for (const f of forbidden) {
      expect(SHAREABLE_CUSTOMER_FIELDS as readonly string[]).not.toContain(f);
    }
  });
});

describe("completion report", () => {
  it("captures the report fields including failed trip", () => {
    const row = buildCompletionReport({
      tenantId: "t1",
      towJobId: "j1",
      driverId: "d1",
      input: {
        work_performed: "Jump start",
        vehicle_picked_up: false,
        waiting_minutes: 15,
        failed_trip: true,
        customer_signed: true,
      },
      extraCostMinor: 5000,
    });
    expect(row.failed_trip).toBe(true);
    expect(row.waiting_minutes).toBe(15);
    expect(row.extra_cost_minor).toBe(5000);
  });
});
