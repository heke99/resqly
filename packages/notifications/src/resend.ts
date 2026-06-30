import type { ChannelAdapter, NotificationResult, OutboundNotification } from "./channels";

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface ResendEmailAdapterOptions {
  apiKey: string;
  from: string;
  replyTo?: string;
  fetchImpl?: FetchLike;
}

/** Production Resend adapter using the HTTPS API directly to avoid bundling it client-side. */
export class ResendEmailAdapter implements ChannelAdapter {
  readonly channel = "email" as const;
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: ResendEmailAdapterOptions) {
    if (!opts.apiKey) throw new Error("RESEND_API_KEY is required for ResendEmailAdapter");
    if (!opts.from) throw new Error("EMAIL_FROM is required for ResendEmailAdapter");
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async send(message: OutboundNotification): Promise<NotificationResult> {
    try {
      const res = await this.fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.opts.from,
          to: [message.to],
          subject: message.subject ?? "Resqly",
          html: message.body,
          reply_to: this.opts.replyTo,
          tags: [
            { name: "tenant_id", value: safeTag(message.tenantId ?? "unknown") },
            { name: "channel", value: "email" },
          ],
        }),
      });
      const data = (await res.json()) as { id?: string; message?: string; error?: string };
      if (!res.ok) {
        return { channel: "email", delivered: false, error: data.message ?? data.error ?? `Resend ${res.status}` };
      }
      return { channel: "email", delivered: true, providerMessageId: data.id };
    } catch (e) {
      return { channel: "email", delivered: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

function safeTag(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) || "unknown";
}
