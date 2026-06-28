import { hmacSignature, newId, verifyHmacSignature } from "@roadside/utils";
import type { WebhookEnvelope, WebhookEvent } from "@roadside/types";

export const WEBHOOK_SIGNATURE_HEADER = "x-roadside-signature";
export const WEBHOOK_ID_HEADER = "x-roadside-webhook-id";

export function buildWebhookEnvelope(
  event: WebhookEvent,
  tenantId: string,
  data: Record<string, unknown>,
  now: () => Date = () => new Date(),
): WebhookEnvelope {
  return {
    id: newId(),
    event,
    tenant_id: tenantId,
    created_at: now().toISOString(),
    data,
  };
}

/** Canonical body + signature for an outgoing webhook delivery. */
export function signWebhook(secret: string, envelope: WebhookEnvelope): {
  body: string;
  signature: string;
  headers: Record<string, string>;
} {
  const body = JSON.stringify(envelope);
  const signature = hmacSignature(secret, body);
  return {
    body,
    signature,
    headers: {
      "content-type": "application/json",
      [WEBHOOK_SIGNATURE_HEADER]: signature,
      [WEBHOOK_ID_HEADER]: envelope.id,
    },
  };
}

export function verifyWebhook(secret: string, body: string, signature: string): boolean {
  return verifyHmacSignature(secret, body, signature);
}

/** Determine which tenant webhooks should receive a given event. */
export function selectWebhookTargets<T extends { events: string[]; active: boolean }>(
  webhooks: T[],
  event: WebhookEvent,
): T[] {
  return webhooks.filter((w) => w.active && w.events.includes(event));
}
