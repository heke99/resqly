import type { ChannelAdapter, NotificationResult, OutboundNotification } from "./channels";

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
}

export interface ExpoSendResult {
  ok: boolean;
  status: "sent" | "failed";
  error?: string;
  receipts?: unknown;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Send one or more Expo push messages. Network/transport failures are returned
 * as a failed result rather than thrown, so callers can record push_status and
 * schedule a retry instead of failing the originating request (e.g. dispatch).
 */
export async function sendExpoPush(
  messages: ExpoPushMessage[],
  opts: { fetchImpl?: typeof fetch; url?: string } = {},
): Promise<ExpoSendResult> {
  if (messages.length === 0) return { ok: true, status: "sent" };
  const doFetch = opts.fetchImpl ?? (globalThis.fetch as typeof fetch | undefined);
  if (!doFetch) return { ok: false, status: "failed", error: "fetch_unavailable" };
  try {
    const res = await doFetch(opts.url ?? EXPO_PUSH_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return { ok: false, status: "failed", error: `expo_http_${res.status}` };
    const json = (await res.json()) as { data?: unknown };
    return { ok: true, status: "sent", receipts: json.data };
  } catch (e) {
    return { ok: false, status: "failed", error: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Build a sanitized tow-job-offer push message. This NEVER includes customer
 * PII (name, phone, exact address, personal number, BankID). Only the coarse
 * data a driver needs to decide whether to accept.
 */
export function buildOfferPushMessage(input: {
  expoPushToken: string;
  offerId: string;
  towJobId: string;
  approxArea: string;
  problemType: string;
  vehicleType?: string | null;
  estimatedPayoutMinor?: number | null;
  expiresAt: string;
}): ExpoPushMessage {
  return {
    to: input.expoPushToken,
    title: "Nytt bärgningsuppdrag",
    body: `${input.problemType} nära ${input.approxArea}`,
    sound: "default",
    priority: "high",
    data: {
      type: "tow_job_offer",
      offer_id: input.offerId,
      tow_job_id: input.towJobId,
      approx_area: input.approxArea,
      problem_type: input.problemType,
      vehicle_type: input.vehicleType ?? null,
      estimated_payout_minor: input.estimatedPayoutMinor ?? null,
      expires_at: input.expiresAt,
    },
  };
}

/** ChannelAdapter wrapping the Expo push transport (channel = "push"). */
export class ExpoPushAdapter implements ChannelAdapter {
  readonly channel = "push" as const;
  constructor(private readonly opts: { fetchImpl?: typeof fetch; url?: string } = {}) {}
  async send(message: OutboundNotification): Promise<NotificationResult> {
    const res = await sendExpoPush(
      [{ to: message.to, body: message.body, title: message.subject ?? undefined }],
      this.opts,
    );
    return { channel: "push", delivered: res.ok, error: res.error };
  }
}
