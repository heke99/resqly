import { describe, expect, it } from "vitest";
import { emailOutcome } from "./customer-email-db";

describe("customer email retry outcomes", () => {
  it("records provider acceptance separately from recipient delivery", () => {
    expect(emailOutcome({ channel: "email", delivered: true, providerMessageId: "provider-id" },1))
      .toEqual({ status: "sent", providerMessageId: "provider-id" });
  });
  it("retains an uncertain exhausted send for reconciliation", () => {
    expect(emailOutcome({ channel: "email", delivered: false, retryable: true, uncertain: true },8).status).toBe("uncertain");
  });
  it("backs off transient failures but does not retry invalid requests", () => {
    expect(emailOutcome({ channel: "email", delivered: false, retryable: true },2,0))
      .toMatchObject({ status: "pending", nextAttemptAt: new Date(60_000).toISOString() });
    expect(emailOutcome({ channel: "email", delivered: false, retryable: false },1).status).toBe("failed");
  });
});
