import { describe, expect, it } from "vitest";
import { ResendEmailAdapter, type FetchLike } from "./resend";

describe("ResendEmailAdapter", () => {
  it("sends email through Resend API", async () => {
    const calls: Array<{ url: string; init?: unknown }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ id: "email-id" }) };
    };
    const adapter = new ResendEmailAdapter({ apiKey: "re_test", from: "Resqly <no-reply@mail.resqly.se>", fetchImpl });
    const res = await adapter.send({ channel: "email", to: "a@example.com", subject: "Hej", body: "<p>OK</p>", tenantId: "tenant" });
    expect(res.delivered).toBe(true);
    expect(res.providerMessageId).toBe("email-id");
    expect(calls[0]?.url).toBe("https://api.resend.com/emails");
    expect((calls[0]?.init as { headers: Record<string, string> }).headers.Authorization).toContain("Bearer re_test");
  });
});
