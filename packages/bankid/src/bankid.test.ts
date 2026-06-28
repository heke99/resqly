import { describe, expect, it } from "vitest";
import { getBankidProvider } from "./factory";
import { SimulatedBankidProvider } from "./simulated";
import { buildSignatureRecord } from "./signature";

describe("getBankidProvider", () => {
  it("returns the mock provider when mock is enabled", () => {
    const p = getBankidProvider({ env: "test", mockEnabled: true });
    expect(p.environment).toBe("mock");
  });
  it("returns the test provider for env=test", () => {
    const p = getBankidProvider({ env: "test", mockEnabled: false });
    expect(p.environment).toBe("test");
  });
  it("throws for production without an adapter", () => {
    expect(() => getBankidProvider({ env: "production", mockEnabled: false })).toThrow(
      /production adapter/i,
    );
  });
});

describe("SimulatedBankidProvider flow", () => {
  it("completes in one collect for the mock (1 step)", async () => {
    const p = new SimulatedBankidProvider({ environment: "mock", stepsToComplete: 1 });
    const { orderRef } = await p.start({ purpose: "Sign case", personalNumber: "199001011234" });
    const r = await p.collect(orderRef);
    expect(r.status).toBe("complete");
    expect(r.completionData?.name).toContain("Test User");
  });

  it("progresses through statuses for the test env (multi-step)", async () => {
    const p = new SimulatedBankidProvider({ environment: "test", stepsToComplete: 3 });
    const { orderRef } = await p.start({ purpose: "Sign case" });
    const s1 = await p.collect(orderRef);
    const s2 = await p.collect(orderRef);
    const s3 = await p.collect(orderRef);
    expect(s1.status).not.toBe("complete");
    expect(s3.status).toBe("complete");
    expect([s1.status, s2.status]).not.toContain("complete");
  });

  it("reports cancellation", async () => {
    const p = new SimulatedBankidProvider({ environment: "test", stepsToComplete: 3 });
    const { orderRef } = await p.start({ purpose: "Sign case" });
    await p.cancel(orderRef);
    const r = await p.collect(orderRef);
    expect(r.status).toBe("cancelled");
  });

  it("fails for unknown order refs", async () => {
    const p = new SimulatedBankidProvider({ environment: "mock" });
    expect((await p.collect("nope")).status).toBe("failed");
  });
});

describe("buildSignatureRecord", () => {
  it("hashes the personal number and never exposes it", () => {
    const record = buildSignatureRecord({
      tenantId: "t1",
      userId: "u1",
      orderRef: "ref",
      environment: "mock",
      pepper: "pepper",
      signedPayload: { case: "IF-2026-000001" },
      completion: { personalNumber: "199001011234", name: "Test User", signature: "sig" },
    });
    expect(record.personal_number_hash).not.toContain("1234");
    expect(record.bankid_status).toBe("complete");
    expect(record.signed_payload_hash).toHaveLength(64);
    expect(Object.keys(record)).not.toContain("personal_number");
  });
});
