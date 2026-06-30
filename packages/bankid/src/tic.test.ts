import { describe, expect, it } from "vitest";
import { hmacSignature } from "@resqly/utils";
import { TicBankidProvider, verifyTicWebhookSignature, type FetchLike } from "./tic";

describe("TicBankidProvider", () => {
  it("starts a BankID session through TIC", async () => {
    const calls: Array<{ url: string; init?: unknown }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sessionId: "tic-session",
          orderRef: "order-ref",
          autoStartToken: "auto",
          qrStartToken: "qr-token",
          qrStartSecret: "qr-secret",
          subscriptionToken: "sub",
          sessionExpiresAt: "2026-01-01T00:00:00Z",
        }),
      };
    };
    const provider = new TicBankidProvider({ apiBaseUrl: "https://id.tic.io/api/v1", apiKey: "key", fetchImpl });
    const res = await provider.start({ purpose: "auth", endUserIp: "127.0.0.1", userAgent: "test" });
    expect(res.sessionId).toBe("tic-session");
    expect(calls[0]?.url).toBe("https://id.tic.io/api/v1/auth/bankid/start");
    expect(JSON.parse(String((calls[0]?.init as { body?: string }).body)).endUserIp).toBe("127.0.0.1");
  });

  it("verifies TIC webhook HMAC over raw body", () => {
    const body = JSON.stringify({ event: "sign.completed" });
    const sig = hmacSignature("secret", body);
    expect(verifyTicWebhookSignature("secret", body, sig)).toBe(true);
    expect(verifyTicWebhookSignature("secret", body + "x", sig)).toBe(false);
  });
});
