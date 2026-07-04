import { describe, expect, it } from "vitest";
import { HttpSmsAdapter, resolveSmsConfig } from "./sms";

describe("resolveSmsConfig", () => {
  it("returns null unless SMS is explicitly enabled", () => {
    expect(resolveSmsConfig({})).toBeNull();
    expect(resolveSmsConfig({ SMS_PROVIDER: "46elks", SMS_API_KEY: "k" })).toBeNull();
    expect(resolveSmsConfig({ SMS_ENABLED: "false", SMS_PROVIDER: "46elks", SMS_API_KEY: "k" })).toBeNull();
  });

  it("returns null when enabled but credentials are missing", () => {
    expect(resolveSmsConfig({ SMS_ENABLED: "true" })).toBeNull();
    expect(resolveSmsConfig({ SMS_ENABLED: "true", SMS_PROVIDER: "46elks" })).toBeNull();
  });

  it("resolves a full configuration", () => {
    const cfg = resolveSmsConfig({
      SMS_ENABLED: "true",
      SMS_PROVIDER: "46elks",
      SMS_API_KEY: "user:pass",
      SMS_FROM: "Resqly",
    });
    expect(cfg).toEqual({ provider: "46elks", apiKey: "user:pass", from: "Resqly" });
  });
});

describe("HttpSmsAdapter", () => {
  it("rejects unsupported providers", () => {
    expect(() => new HttpSmsAdapter({ provider: "unknown", apiKey: "k", from: "Resqly" })).toThrow(
      /Unsupported SMS provider/,
    );
  });

  it("sends via the 46elks API with basic auth", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const adapter = new HttpSmsAdapter({
      provider: "46elks",
      apiKey: "user:pass",
      from: "Resqly",
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "sms123" }) };
      },
    });
    const res = await adapter.send({ channel: "sms", to: "+46700000000", body: "Testmeddelande" });
    expect(res.delivered).toBe(true);
    expect(res.providerMessageId).toBe("sms123");
    expect(calls[0]!.url).toBe("https://api.46elks.com/a1/sms");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toContain("Basic ");
    expect(String(calls[0]!.init?.body)).toContain("to=%2B46700000000");
  });

  it("reports provider errors without throwing", async () => {
    const adapter = new HttpSmsAdapter({
      provider: "46elks",
      apiKey: "user:pass",
      from: "Resqly",
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => "forbidden" }),
    });
    const res = await adapter.send({ channel: "sms", to: "+46700000000", body: "x" });
    expect(res.delivered).toBe(false);
    expect(res.error).toContain("403");
  });
});
