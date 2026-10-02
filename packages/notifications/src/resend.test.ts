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

  it("reuses the persisted request and idempotency key after configuration changes", async () => {
    const requests: RequestInit[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      requests.push(init!);
      return { ok: true, status: 200, json: async () => ({ id: "same-id" }) };
    };
    const message = { channel: "email" as const, to: "fixture@example.com", body: "<p>Original</p>", idempotencyKey: "event-1" };
    const first = new ResendEmailAdapter({ apiKey: "test", from: "first@example.com", fetchImpl });
    const preparedRequest = first.prepare(message);
    await first.send({ ...message, preparedRequest });
    await new ResendEmailAdapter({ apiKey: "test", from: "changed@example.com", fetchImpl }).send({ ...message, body: "Changed", preparedRequest });
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[1]?.headers).toMatchObject({ "Idempotency-Key": "event-1" });
  });

  it.each([400,401,403,422,429,500])("classifies HTTP %s for retry", async (status) => {
    const adapter = new ResendEmailAdapter({ apiKey: "test", from: "test@example.com",
      fetchImpl: async () => ({ ok: false, status, json: async () => ({ message: "rejected" }) }) });
    const result = await adapter.send({ channel: "email", to: "fixture@example.com", body: "hello" });
    expect(result.delivered).toBe(false);
    expect(result.retryable).toBe(status === 429 || status >= 500);
  });
});
