import { buildWebhookEnvelope, signWebhook } from "@resqly/notifications";
import type { WebhookEvent } from "@resqly/types";
import type { AppSupabaseClient } from "@resqly/database";
import { processDelivery } from "./webhook-delivery";

export interface WebhookDeliveryRow {
  id: string;
  tenant_id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivering" | "failed" | "succeeded" | "exhausted";
  attempts: number;
}

interface TenantWebhookRow {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
}

export type FetchLike = (url: string, init?: unknown) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export async function pollWebhookDeliveries(
  db: AppSupabaseClient,
  opts: { fetchImpl?: FetchLike; now?: Date; limit?: number } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const { data } = await db
    .from("webhook_deliveries" as never)
    .select("id, tenant_id, webhook_id, event, payload, status, attempts")
    .in("status", ["pending", "failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 50);

  const deliveries = ((data as WebhookDeliveryRow[] | null) ?? []) as WebhookDeliveryRow[];
  for (const delivery of deliveries) {
    await db
      .from("webhook_deliveries" as never)
      .update({ status: "delivering", updated_at: new Date().toISOString() } as never)
      .eq("id", delivery.id);

    const { data: webhook } = await db
      .from("tenant_webhooks" as never)
      .select("id, url, secret, active, events")
      .eq("id", delivery.webhook_id)
      .maybeSingle();
    const target = webhook as TenantWebhookRow | null;
    const outcome = await processDelivery(
      delivery,
      () => deliverOnce(delivery, target, opts.fetchImpl ?? defaultFetch),
      { now: now.getTime() },
    );

    await db
      .from("webhook_deliveries" as never)
      .update({
        status: outcome.status,
        attempts: outcome.attempts,
        next_attempt_at: outcome.nextAttemptAt,
        last_error: outcome.error ?? null,
        response_status: outcome.responseStatus ?? null,
        response_body: outcome.responseBody ?? null,
        updated_at: new Date().toISOString(),
        delivered_at: outcome.status === "succeeded" ? new Date().toISOString() : null,
      } as never)
      .eq("id", delivery.id);
  }
}

async function deliverOnce(
  delivery: WebhookDeliveryRow,
  target: TenantWebhookRow | null,
  fetchImpl: FetchLike,
): Promise<{ ok: boolean; error?: string; responseStatus?: number | null; responseBody?: string | null }> {
  if (!target || !target.active) return { ok: false, error: "webhook target inactive or missing", responseStatus: null, responseBody: null };
  if (!target.events.includes(delivery.event)) return { ok: false, error: "webhook target no longer subscribes to event", responseStatus: null, responseBody: null };

  const envelope = buildWebhookEnvelope(
    delivery.event as WebhookEvent,
    delivery.tenant_id,
    delivery.payload,
  );
  const signed = signWebhook(target.secret, envelope);
  const res = await fetchImpl(target.url, {
    method: "POST",
    headers: signed.headers,
    body: signed.body,
  });
  const responseBody = await res.text().catch(() => "");
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}${responseBody ? ` ${responseBody.slice(0, 500)}` : ""}`, responseStatus: res.status, responseBody: responseBody.slice(0, 4000) };
  return { ok: true, responseStatus: res.status, responseBody: responseBody.slice(0, 4000) };
}

const defaultFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init as RequestInit);
  return { ok: res.ok, status: res.status, text: () => res.text() };
};
