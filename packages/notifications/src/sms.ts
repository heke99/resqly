import type { ChannelAdapter, NotificationResult, OutboundNotification } from "./channels";

export type SmsFetchLike = (url: string, init?: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface SmsAdapterOptions {
  /** Provider identifier, e.g. "46elks". Only providers listed here are supported. */
  provider: string;
  apiKey: string;
  /** Some providers (46elks) use user:password style credentials — apiKey is "user:password". */
  from: string;
  fetchImpl?: SmsFetchLike;
}

export interface SmsConfigEnv {
  SMS_ENABLED?: string;
  SMS_PROVIDER?: string;
  SMS_API_KEY?: string;
  SMS_FROM?: string;
}

/**
 * Resolve SMS configuration from env. Returns null unless SMS is explicitly
 * enabled AND fully configured — the platform then falls back to other
 * channels and surfaces "SMS not configured" only in the internal readiness
 * view, never to end users.
 */
export function resolveSmsConfig(env: SmsConfigEnv = process.env as SmsConfigEnv): SmsAdapterOptions | null {
  if (env.SMS_ENABLED !== "true") return null;
  const provider = env.SMS_PROVIDER?.trim().toLowerCase();
  const apiKey = env.SMS_API_KEY?.trim();
  const from = env.SMS_FROM?.trim() || "Resqly";
  if (!provider || !apiKey) return null;
  return { provider, apiKey, from };
}

/**
 * Production SMS adapter. Supports 46elks (Swedish SMS gateway) out of the
 * box; other providers can be added behind the same interface. Never include
 * sensitive customer details in operational SMS payloads.
 */
export class HttpSmsAdapter implements ChannelAdapter {
  readonly channel = "sms" as const;
  private readonly fetchImpl: SmsFetchLike;

  constructor(private readonly opts: SmsAdapterOptions) {
    if (!opts.apiKey) throw new Error("SMS_API_KEY is required for HttpSmsAdapter");
    if (opts.provider !== "46elks") {
      throw new Error(`Unsupported SMS provider: ${opts.provider}. Supported: 46elks`);
    }
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as SmsFetchLike);
  }

  async send(message: OutboundNotification): Promise<NotificationResult> {
    try {
      const body = new URLSearchParams({
        from: this.opts.from,
        to: message.to,
        message: message.body,
      });
      const res = await this.fetchImpl("https://api.46elks.com/a1/sms", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(this.opts.apiKey).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
      const text = await res.text().catch(() => "");
      if (!res.ok) {
        return { channel: "sms", delivered: false, error: `SMS ${res.status}${text ? ` ${text.slice(0, 300)}` : ""}` };
      }
      let providerMessageId: string | undefined;
      try {
        providerMessageId = (JSON.parse(text) as { id?: string }).id;
      } catch {
        providerMessageId = undefined;
      }
      return { channel: "sms", delivered: true, providerMessageId };
    } catch (e) {
      return { channel: "sms", delivered: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
