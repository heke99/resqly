import { ResendEmailAdapter } from "@resqly/notifications";
import type { ApiContext } from "../context";

export async function enqueueWebhookEvent(
  ctx: ApiContext,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await ctx.repo.enqueueWebhookEvent(ctx.tenantId, event, payload).catch(() => undefined);
}

export async function sendEmail(
  ctx: ApiContext,
  params: {
    to: string | null | undefined;
    subject: string;
    html: string;
    incidentId?: string | null;
    towJobId?: string | null;
    provider?: "resend";
  },
): Promise<void> {
  if (!params.to) return;
  if (ctx.config.email?.enabled === false) return;
  const apiKey = ctx.config.email?.resendApiKey;
  const from = ctx.config.email?.from;
  if (!apiKey || !from) {
    await ctx.repo.recordNotificationDelivery({
      tenant_id: ctx.tenantId,
      incident_id: params.incidentId ?? null,
      tow_job_id: params.towJobId ?? null,
      channel: "email",
      provider: "resend",
      to_address: params.to,
      subject: params.subject,
      status: "skipped",
      error: "Resend is not configured",
      payload: { reason: "missing_resend_env" },
    }).catch(() => undefined);
    return;
  }
  const adapter = new ResendEmailAdapter({
    apiKey,
    from,
    replyTo: ctx.config.email?.replyTo,
    fetchImpl: ctx.config.email?.fetchImpl,
  });
  const result = await adapter.send({
    channel: "email",
    to: params.to,
    subject: params.subject,
    body: params.html,
    tenantId: ctx.tenantId,
  });
  await ctx.repo.recordNotificationDelivery({
    tenant_id: ctx.tenantId,
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
  }).catch(() => undefined);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
