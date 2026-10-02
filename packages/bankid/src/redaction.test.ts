import { describe, expect, it } from "vitest";
import { buildSignatureRecord } from "./signature";
import { redactBankidValue } from "./redaction";

describe("persisted BankID provider data", () => {
  it("removes nested personal numbers and session secrets while preserving proof fields", () => {
    const raw = {
      status: "complete",
      sessionId: "provider-session",
      user: { personalNumber: "199001011234", name: "Customer" },
      completionData: {
        user: { personal_number: "199001011234" },
        signature: "proof",
        ocspResponse: "ocsp",
      },
      history: [{ personnummer: "199001011234", subscriptionToken: "secret", event: "complete" }],
    };
    const sanitized = redactBankidValue(raw);
    expect(JSON.stringify(sanitized)).not.toContain("199001011234");
    expect(JSON.stringify(sanitized)).not.toContain("secret");
    expect((sanitized as typeof raw).completionData.signature).toBe("proof");
    const record = buildSignatureRecord({
      tenantId: "tenant",
      userId: "customer",
      orderRef: "order",
      environment: "test",
      pepper: "test-pepper",
      signedPayload: "immutable-json",
      completion: { personalNumber: "199001011234", name: "Customer", signature: "proof", raw },
    });
    expect(record.personal_number_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain("199001011234");
    expect(record.signature).toBe("proof");
  });
});
