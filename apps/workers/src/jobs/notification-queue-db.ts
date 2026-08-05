import type { AppSupabaseClient } from "@resqly/database";
import type { ChannelAdapter } from "@resqly/notifications";

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

/**
 * Deliver due rows from the operational notification queue (SMS fallback,
 * operational alerts). Each row is attempted at most MAX_ATTEMPTS times with
 * backoff. Rows for unconfigured channels are marked skipped — never lost
 * silently — so the internal operations portal can surface them.
 */
export async function pollOperationalNotificationQueue(
  db: AppSupabaseClient,
  adapters: Partial<Record<"sms" | "email", ChannelAdapter>>,
  opts: { now?: Date; limit?: number } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const { data, error: loadError } = await db
    .from("operational_notification_queue" as never)
    .select("id, tenant_id, tow_job_id, offer_id, channel, recipient, template_key, payload, status, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 25);
  if (loadError) throw new Error(`notification queue load failed: ${loadError.message}`);

  const rows = ((data as OperationalNotificationRow[] | null) ?? []) as OperationalNotificationRow[];
  for (const row of rows) {
    const adapter = row.channel === "sms" || row.channel === "email" ? adapters[row.channel] : undefined;
    if (!adapter) {
      const { error: skipError } = await db
        .from("operational_notification_queue" as never)
        .update({
          status: "skipped",
          last_error: `${row.channel} är inte konfigurerad`,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", row.id);
      if (skipError) throw new Error(`notification queue skip failed: ${skipError.message}`);
      continue;
    }

    const attempts = row.attempts + 1;
    try {
      const result = await adapter.send({
        channel: row.channel as "sms" | "email",
        to: row.recipient,
        subject: row.channel === "email" ? "Resqly – åtgärd krävs" : null,
        body: renderOperationalMessage(row),
        tenantId: row.tenant_id ?? undefined,
      });
      if (result.delivered) {
        const { error: sentError } = await db
          .from("operational_notification_queue" as never)
          .update({ status: "sent", attempts, last_error: null, updated_at: new Date().toISOString() } as never)
          .eq("id", row.id);
        if (sentError) throw new Error(`notification queue sent update failed: ${sentError.message}`);
      } else {
        await failOrRetry(db, row, attempts, result.error ?? "delivery failed");
      }
    } catch (e) {
      await failOrRetry(db, row, attempts, e instanceof Error ? e.message : String(e));
    }
  }
}

async function failOrRetry(
  db: AppSupabaseClient,
  row: OperationalNotificationRow,
  attempts: number,
  error: string,
): Promise<void> {
  if (attempts >= MAX_ATTEMPTS) {
    const { error: updateError } = await db
      .from("operational_notification_queue" as never)
      .update({ status: "failed", attempts, last_error: error, updated_at: new Date().toISOString() } as never)
      .eq("id", row.id);
    if (updateError) throw new Error(`notification queue failure update failed: ${updateError.message}`);
    return;
  }
  const backoff = RETRY_BACKOFF_MS[Math.min(attempts - 1, RETRY_BACKOFF_MS.length - 1)]!;
  const { error: updateError } = await db
    .from("operational_notification_queue" as never)
    .update({
      status: "pending",
      attempts,
      last_error: error,
      next_attempt_at: new Date(Date.now() + backoff).toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", row.id);
  if (updateError) throw new Error(`notification queue retry update failed: ${updateError.message}`);
}
