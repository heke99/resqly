import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";
import { webhookEventSchema } from "./enums";

export const webhookEnvelopeSchema = z.object({
  id: uuidSchema,
  event: webhookEventSchema,
  tenant_id: uuidSchema,
  created_at: isoDateTimeSchema,
  data: z.record(z.unknown()),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

export const tenantWebhookSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  url: z.string().url(),
  events: z.array(webhookEventSchema),
  active: z.boolean().default(true),
  /** Secret is never returned in API responses (write-only). */
  secret_set: z.boolean().default(true),
});
export type TenantWebhook = z.infer<typeof tenantWebhookSchema>;

export const webhookDeliverySchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  webhook_id: uuidSchema,
  event: webhookEventSchema,
  status: z.enum(["pending", "delivering", "succeeded", "failed", "exhausted"]),
  attempts: z.number().int().nonnegative().default(0),
  last_error: z.string().nullable().optional(),
  next_attempt_at: isoDateTimeSchema.nullable().optional(),
  created_at: isoDateTimeSchema,
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;
