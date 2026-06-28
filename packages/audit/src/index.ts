import type { AuditAction } from "@roadside/types";
import type { AppSupabaseClient } from "@roadside/database";

export interface AuditInput {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  /** Field names involved — never the sensitive values themselves. */
  fields?: string[];
  reason?: string | null;
  ip?: string | null;
  device?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditRow {
  tenant_id: string | null;
  actor_user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  fields: string[];
  reason: string | null;
  ip: string | null;
  device: string | null;
  metadata: Record<string, unknown> | null;
}

export function buildAuditRow(input: AuditInput): AuditRow {
  return {
    tenant_id: input.tenantId ?? null,
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    fields: input.fields ?? [],
    reason: input.reason ?? null,
    ip: input.ip ?? null,
    device: input.device ?? null,
    metadata: input.metadata ?? null,
  };
}

/** Persist an audit log entry. Uses a service-role client. */
export async function recordAudit(client: AppSupabaseClient, input: AuditInput): Promise<void> {
  const { error } = await client.from("audit_logs").insert(buildAuditRow(input) as never);
  if (error) throw new Error(`recordAudit failed: ${error.message}`);
}

export interface SecurityEventInput {
  tenantId?: string | null;
  kind:
    | "auth_failure"
    | "rate_limit_exceeded"
    | "rls_denied"
    | "webhook_signature_invalid"
    | "permission_denied"
    | "suspicious_access";
  severity?: "info" | "warning" | "critical";
  detail?: string | null;
}

export async function recordSecurityEvent(
  client: AppSupabaseClient,
  input: SecurityEventInput,
): Promise<void> {
  const { error } = await client.from("security_events").insert({
    tenant_id: input.tenantId ?? null,
    kind: input.kind,
    severity: input.severity ?? "info",
    detail: input.detail ?? null,
  } as never);
  if (error) throw new Error(`recordSecurityEvent failed: ${error.message}`);
}

/**
 * Convenience for the legally-important customer-data-sharing audit (section 14):
 * records exactly which fields were shared with which driver and why.
 */
export function buildCustomerShareAudit(params: {
  tenantId: string;
  actorUserId?: string | null;
  driverId: string;
  towJobId: string;
  fields: string[];
  reason: string;
  ip?: string | null;
  device?: string | null;
}): AuditRow {
  return buildAuditRow({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId ?? null,
    action: "data_share",
    entityType: "tow_job_customer_share",
    entityId: params.towJobId,
    fields: params.fields,
    reason: params.reason,
    ip: params.ip ?? null,
    device: params.device ?? null,
    metadata: { driver_id: params.driverId },
  });
}
