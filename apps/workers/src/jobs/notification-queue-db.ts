import type { AppSupabaseClient } from "@resqly/database";
import type { ChannelAdapter, OutboundNotification } from "@resqly/notifications";

export interface OperationalNotificationRow {
  id: string;
  tenant_id: string | null;
  tow_job_id: string | null;
  offer_id: string | null;
  channel: "push" | "sms" | "email" | "in_app" | "webhook";
  recipient: string;
  template_key: string;
  payload: Record<string, unknown>;
  status: "pending" | "sent" | "failed" | "skipped" | "cancelled";
  attempts: number;
}

import { bindDeliveryRequest, claimDeliveries, settleDelivery, type DeliveryLease } from "./delivery-lease-db";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000];

/** Render a short Swedish operational message. Payloads never contain PII. */
export function renderOperationalMessage(row: OperationalNotificationRow): string {
  const jobRef = row.tow_job_id ? row.tow_job_id.slice(0, 8).toUpperCase() : null;
  switch (row.template_key) {
    case "offer_push_fallback":
      return jobRef
        ? `Resqly: Ett bärgningsuppdrag (${jobRef}) väntar på svar. Öppna förar-appen.`
        : "Resqly: Ett bärgningsuppdrag väntar på svar. Öppna förar-appen.";
    case "manual_review_alert":
      return jobRef
        ? `Resqly: Ärende ${jobRef} behöver hjälp av en handläggare.`
        : "Resqly: Ett ärende behöver hjälp av en handläggare.";
    default:
      return (row.payload.message as string | undefined) ?? "Resqly: Ny händelse kräver åtgärd.";
  }
}

/** Claim before sending and settle only the current lease. */
export async function pollOperationalNotificationQueue(
  db: AppSupabaseClient,
  adapters: Partial<Record<"sms" | "email", ChannelAdapter>>,
  opts: { now?: Date; limit?: number; workerId?: string } = {},
): Promise<void> {
  const channels = Object.keys(adapters).filter((key) => adapters[key as "sms" | "email"]);
  if (!channels.length) return;
  const rows = await claimDeliveries<OperationalNotificationRow & DeliveryLease>(
    db, "operational_notification_queue", { ...opts, channels },
  );
  for (const row of rows) {
    const adapter = row.channel === "sms" || row.channel === "email" ? adapters[row.channel] : undefined;
    if (!adapter) throw new Error("Claimed an unconfigured notification channel");
    const message: OutboundNotification = {
      channel: row.channel, to: row.recipient,
      subject: row.channel === "email" ? "Resqly – åtgärd krävs" : null,
      body: renderOperationalMessage(row), tenantId: row.tenant_id ?? undefined,
      idempotencyKey: `resqly/operational/${row.id}`,
    };
    const request = await bindDeliveryRequest(db, "operational_notification_queue", row,
      adapter.prepare ? adapter.prepare(message) : { to: message.to, body: message.body });
    const result = await adapter.send({ ...message, preparedRequest: request,
      ...(row.channel === "sms" ? { to: String(request.to), body: String(request.body) } : {}),
    });
    const status = result.delivered ? "sent"
      : row.channel === "sms" && result.uncertain ? "uncertain"
      : !result.retryable || row.attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    await settleDelivery(db, "operational_notification_queue", row, {
      status, error: result.error, providerMessageId: result.providerMessageId,
      nextAttemptAt: status === "pending"
        ? new Date((opts.now?.getTime() ?? Date.now()) + RETRY_BACKOFF_MS[row.attempts - 1]!).toISOString() : null,
    });
  }
}
