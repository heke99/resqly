import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";
import { auditActionSchema } from "./enums";

export const auditLogSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema.nullable(),
  actor_user_id: uuidSchema.nullable(),
  action: auditActionSchema,
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  /** Field names that were read/shared/changed — never the sensitive values. */
  fields: z.array(z.string()).default([]),
  reason: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  device: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  created_at: isoDateTimeSchema,
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const securityEventSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema.nullable(),
  kind: z.enum([
    "auth_failure",
    "rate_limit_exceeded",
    "rls_denied",
    "webhook_signature_invalid",
    "permission_denied",
    "suspicious_access",
  ]),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  detail: z.string().nullable().optional(),
  created_at: isoDateTimeSchema,
});
export type SecurityEvent = z.infer<typeof securityEventSchema>;
