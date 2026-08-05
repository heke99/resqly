import type { AppSupabaseClient } from "@resqly/database";
import {
  createSupabaseDispatchStore,
  loadDispatchSettings,
  orchestrateDispatch,
} from "@resqly/dispatch";

interface DispatchRetryRow {
  job_id: string;
  tenant_id: string;
  incident_id: string;
  job_status: "created" | "matching";
  payer_type: "insurance_company" | "customer_private";
  priority: "normal" | "high" | "urgent";
  problem_type: string | null;
  case_number: string | null;
  pickup_lat: number;
  pickup_lng: number;
}

async function enqueueRecoveryWebhook(
  db: AppSupabaseClient,
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data: hooks, error: hookError } = await db
    .from("tenant_webhooks" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .contains("events", [event] as never);
  if (hookError) throw new Error(hookError.message);

  const rows = ((hooks as Array<{ id: string }> | null) ?? []).map((hook) => ({
    tenant_id: tenantId,
    webhook_id: hook.id,
    event,
    payload,
    status: "pending",
    attempts: 0,
    next_attempt_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;

  // The claim RPC makes normal recovery single-run. The extra existence check
  // protects against a worker crash after orchestration but before attempt
  // bookkeeping, without relying on JSON requests from the customer again.
  for (const row of rows) {
    const towJobId = typeof payload.tow_job_id === "string" ? payload.tow_job_id : null;
    let query = db
      .from("webhook_deliveries" as never)
      .select("id")
      .eq("webhook_id", row.webhook_id)
      .eq("event", event);
    if (towJobId) query = query.contains("payload", { tow_job_id: towJobId } as never);
    const { data: existing, error: existingError } = await query.limit(1).maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) continue;
    const { error } = await db.from("webhook_deliveries" as never).insert(row as never);
    if (error) throw new Error(error.message);
  }
}

/**
 * Recover jobs that were committed as created/matching but whose request died
 * before dispatch completed. Rows are claimed with FOR UPDATE SKIP LOCKED by
 * the database RPC, so several worker instances can run safely.
 */
export async function pollDispatchRecovery(
  db: AppSupabaseClient,
  opts: { limit?: number; minAgeSeconds?: number; pushEnabled?: boolean; pushUrl?: string } = {},
): Promise<void> {
  const { data, error } = await db.rpc("claim_tow_dispatch_retries" as never, {
    p_limit: Math.max(1, Math.min(opts.limit ?? 10, 50)),
    p_min_age_seconds: Math.max(15, opts.minAgeSeconds ?? 30),
  } as never);
  if (error) throw new Error(error.message);

  const jobs = (data as DispatchRetryRow[] | null) ?? [];
  const failures: string[] = [];
  for (const row of jobs) {
    try {
      const settings = await loadDispatchSettings(db, row.tenant_id);
      await orchestrateDispatch(
        createSupabaseDispatchStore(db),
        {
          tenantId: row.tenant_id,
          job: { id: row.job_id, incident_id: row.incident_id, status: row.job_status },
          pickup: { lat: row.pickup_lat, lng: row.pickup_lng },
          payerType: row.payer_type,
          priority: row.priority,
          problemType: row.problem_type,
          caseNumber: row.case_number,
          actorUserId: null,
          actorKind: "worker",
          actorWorker: "dispatch-recovery",
          settings,
        },
        {
          push: { enabled: opts.pushEnabled, url: opts.pushUrl },
          onEvent: (event, payload) => enqueueRecoveryWebhook(db, row.tenant_id, event, payload),
        },
      );
      const { error: attemptError } = await db.rpc("record_tow_dispatch_attempt" as never, {
        p_job: row.job_id,
        p_error: null,
      } as never);
      if (attemptError) throw new Error(attemptError.message);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const { error: attemptError } = await db.rpc("record_tow_dispatch_attempt" as never, {
        p_job: row.job_id,
        p_error: message,
      } as never);
      if (attemptError) {
        failures.push(`job ${row.job_id}: dispatch failed (${message}); attempt bookkeeping failed (${attemptError.message})`);
      } else {
        failures.push(`job ${row.job_id}: ${message}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join(" | ").slice(0, 4000));
  }
}
