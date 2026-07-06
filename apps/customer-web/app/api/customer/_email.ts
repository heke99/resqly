import { ResendEmailAdapter } from "@resqly/notifications";
import type { AppSupabaseClient } from "@resqly/database";

/**
 * Customer email notifications from the web app's server routes. Mirrors the
 * partner API's email service: every send is logged in the
 * notification_deliveries ledger and deduplicated on a business-event key so
 * retries never spam the customer. Failures never break the main flow.
 */
export async function sendCustomerEmail(
  db: AppSupabaseClient,
  params: {
    tenantId: string;
    to: string | null | undefined;
    subject: string;
    html: string;
    incidentId?: string | null;
    towJobId?: string | null;
    dedupeKey: string;
  },
): Promise<void> {
  try {
    if (!params.to) return;
    if (process.env.NOTIFICATIONS_EMAIL_ENABLED === "false") return;

    const { data: existing } = await db
      .from("notification_deliveries" as never)
      .select("id")
      .eq("dedupe_key", params.dedupeKey)
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      await db.from("notification_deliveries" as never).insert({
        tenant_id: params.tenantId,
        incident_id: params.incidentId ?? null,
        tow_job_id: params.towJobId ?? null,
        channel: "email",
        provider: "resend",
        to_address: params.to,
        subject: params.subject,
        status: "skipped",
        error: "Resend is not configured",
        payload: { reason: "missing_resend_env" },
        dedupe_key: params.dedupeKey,
      } as never);
      return;
    }

    const adapter = new ResendEmailAdapter({
      apiKey,
      from,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
    const result = await adapter.send({
      channel: "email",
      to: params.to,
      subject: params.subject,
      body: params.html,
      tenantId: params.tenantId,
    });
    await db.from("notification_deliveries" as never).insert({
      tenant_id: params.tenantId,
      incident_id: params.incidentId ?? null,
      tow_job_id: params.towJobId ?? null,
      channel: "email",
      provider: "resend",
      to_address: params.to,
      subject: params.subject,
      status: result.delivered ? "sent" : "failed",
      provider_message_id: result.providerMessageId ?? null,
      error: result.error ?? null,
      payload: { subject: params.subject },
      sent_at: result.delivered ? new Date().toISOString() : null,
      // Failed sends keep no dedupe key so a later retry can attempt again.
      dedupe_key: result.delivered ? params.dedupeKey : null,
    } as never);
  } catch {
    // Notifications are best-effort; the case flow must never fail on email.
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
