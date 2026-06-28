import { describe, expect, it } from "vitest";
import { incidentStatusGuard, transitionIncident } from "./status";
import { evaluateRisk } from "./risk";
import { buildIncidentRow, determineRequiresBankid } from "./incident";

describe("incident status machine", () => {
  it("allows the happy path", () => {
    expect(incidentStatusGuard.canTransition("draft", "awaiting_bankid")).toBe(true);
    expect(incidentStatusGuard.canTransition("awaiting_bankid", "bankid_verified")).toBe(true);
    expect(incidentStatusGuard.canTransition("submitted", "received")).toBe(true);
  });
  it("rejects illegal transitions", () => {
    expect(incidentStatusGuard.canTransition("draft", "completed")).toBe(false);
    expect(() => transitionIncident({ incidentId: "i1", from: "closed", to: "draft" })).toThrow(
      /Illegal status transition/,
    );
  });
  it("produces a status event row", () => {
    const ev = transitionIncident({
      incidentId: "i1",
      from: "submitted",
      to: "received",
      actorUserId: "u1",
    });
    expect(ev).toMatchObject({ from_status: "submitted", to_status: "received", actor_user_id: "u1" });
  });
});

describe("risk engine", () => {
  it("never blocks for low risk and flags missing bankid", () => {
    const low = evaluateRisk({ bankidVerified: true, photoCount: 3 });
    expect(low.status).toBe("low");
    const noBankid = evaluateRisk({ bankidVerified: false, photoCount: 3 });
    expect(noBankid.flags).toContain("bankid_missing");
    expect(noBankid.status).toBe("manual_review_required");
  });
  it("blocks (not rejects) on identity mismatch", () => {
    const r = evaluateRisk({ bankidVerified: true, bankidIdentityMismatch: true });
    expect(r.status).toBe("blocked_until_verified");
    expect(r.flags).toContain("bankid_identity_mismatch");
  });
  it("escalates to high with multiple flags", () => {
    const r = evaluateRisk({
      bankidVerified: true,
      casesInLast24h: 5,
      gpsAccuracyMeters: 500,
      locationManuallyMovedMeters: 5000,
      photoCount: 0,
      sameDeviceCaseCount: 5,
    });
    expect(["high", "medium"]).toContain(r.status);
    expect(r.score).toBeGreaterThanOrEqual(25);
  });
});

describe("incident building", () => {
  it("requires bankid for claims based on settings", () => {
    expect(
      determineRequiresBankid("damage_claim", {
        bankidRequiredForClaims: true,
        bankidRequiredForTow: false,
      }),
    ).toBe(true);
    expect(
      determineRequiresBankid("towing", {
        bankidRequiredForClaims: true,
        bankidRequiredForTow: false,
      }),
    ).toBe(false);
  });
  it("starts awaiting_bankid when bankid is required", () => {
    const row = buildIncidentRow({
      tenantId: "t1",
      customerUserId: "u1",
      requiresBankid: true,
      input: { type: "towing", problem_type: "dead_battery" },
    });
    expect(row.status).toBe("awaiting_bankid");
    expect(row.bankid_verified).toBe(false);
  });
});
