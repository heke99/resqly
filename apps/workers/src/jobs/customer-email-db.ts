import type { AppSupabaseClient } from "@resqly/database";
import type { ChannelAdapter, NotificationResult, OutboundNotification } from "@resqly/notifications";
import { bindDeliveryRequest, claimDeliveries, settleDelivery, type DeliveryLease } from "./delivery-lease-db";

export interface CustomerEmailRow extends DeliveryLease {
  tenant_id: string | null;
  to_address: string;
  subject: string | null;
  payload: { html?: string } | null;
}

/** `sent` records provider acceptance. Inbox events record recipient delivery. */
export function emailOutcome(result: NotificationResult, attempts: number, now = Date.now()) {
  if (result.delivered) return { status: "sent", providerMessageId: result.providerMessageId };
  if (!result.retryable) return { status: "failed", error: result.error ?? "Email rejected" };
  if (attempts >= 8) return { status: result.uncertain ? "uncertain" : "exhausted", error: result.error };
  return { status: "pending", error: result.error,
    nextAttemptAt: new Date(now + Math.min(3_600_000, 30_000 * 2 ** (attempts - 1))).toISOString() };
}

export async function pollCustomerEmails(
  db: AppSupabaseClient, adapter: ChannelAdapter | undefined, opts: { workerId?: string; limit?: number } = {},
): Promise<void> {
  // An unconfigured provider leaves durable intent pending for readiness/ops.
  if (!adapter?.prepare || adapter.channel !== "email") return;
  const rows = await claimDeliveries<CustomerEmailRow>(db, "notification_deliveries", { ...opts, channels: ["email"] });
  for (const row of rows) {
    const body = row.payload?.html;
    if (!body) {
      await settleDelivery(db, "notification_deliveries", row, { status: "blocked", error: "Email template is missing",
        nextAttemptAt: new Date(Date.now() + 3_600_000).toISOString() });
      continue;
    }
    const message: OutboundNotification = { channel: "email", to: row.to_address,
      subject: row.subject, body, tenantId: row.tenant_id ?? undefined, idempotencyKey: `resqly/email/${row.id}` };
    const preparedRequest = await bindDeliveryRequest(db, "notification_deliveries", row, adapter.prepare(message));
    const result = await adapter.send({ ...message, preparedRequest });
    await settleDelivery(db, "notification_deliveries", row, emailOutcome(result, row.attempts));
  }
}
