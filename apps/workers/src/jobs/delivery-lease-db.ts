import type { AppSupabaseClient, Json } from "@resqly/database";

export type DeliveryQueue = "notification_deliveries" | "operational_notification_queue" | "webhook_deliveries";
export interface DeliveryLease {
  id: string;
  claim_token: string;
  attempts: number;
  lease_until: string;
  first_attempt_at: string | null;
  provider_request: Record<string, unknown> | null;
}

export async function claimDeliveries<T extends DeliveryLease>(
  db: AppSupabaseClient, queue: DeliveryQueue, opts: { workerId?: string; limit?: number; channels?: string[] } = {},
): Promise<T[]> {
  const { data, error } = await db.rpc("claim_delivery_batch", {
    p_queue: queue, p_worker: opts.workerId ?? `workers:${process.pid}`,
    p_limit: opts.limit ?? 25, p_lease_seconds: 120, p_channels: opts.channels ?? [],
  });
  if (error) throw new Error(`delivery claim failed: ${error.message}`);
  if (!Array.isArray(data) || !data.every((row) => row && typeof row === "object"
    && "id" in row && typeof row.id === "string" && "claim_token" in row && typeof row.claim_token === "string"
    && "attempts" in row && typeof row.attempts === "number")) throw new Error("Invalid delivery claim response");
  return data as unknown as T[];
}

export async function bindDeliveryRequest(
  db: AppSupabaseClient, queue: DeliveryQueue, row: DeliveryLease, request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { data, error } = await db.rpc("bind_delivery_request", {
    p_queue: queue, p_id: row.id, p_token: row.claim_token, p_request: JSON.parse(JSON.stringify(request)) as Json,
  });
  if (error) throw new Error(`delivery request binding failed: ${error.message}`);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid delivery request response");
  return data;
}

export async function settleDelivery(
  db: AppSupabaseClient, queue: DeliveryQueue, row: DeliveryLease,
  outcome: { status: string; error?: string; nextAttemptAt?: string | null; providerMessageId?: string;
    responseStatus?: number | null; responseBody?: string | null },
): Promise<void> {
  const { data, error } = await db.rpc("settle_delivery", {
    p_queue: queue, p_id: row.id, p_token: row.claim_token, p_status: outcome.status,
    p_error: outcome.error, p_next_attempt_at: outcome.nextAttemptAt ?? undefined,
    p_provider_message_id: outcome.providerMessageId, p_response_status: outcome.responseStatus ?? undefined,
    p_response_body: outcome.responseBody ?? undefined,
  });
  if (error) throw new Error(`delivery settlement failed: ${error.message}`);
  if (data !== true) throw new Error(`delivery lease lost: ${row.id}`);
}
