import { createServiceClient, type AppSupabaseClient } from "@resqly/database";
import { optionalEnv } from "@resqly/utils";
import { buildOfferPushMessage, sendExpoPush } from "@resqly/notifications";
import { evaluateOfferExpiry, type OfferRow } from "./jobs/offer-expiry";
import { selectOfferPushRetries, type OfferPushRow } from "./jobs/offer-push";
import { pollWebhookDeliveries } from "./jobs/webhook-db-delivery";

/**
 * Worker runner. Polls the database for due offer expiries and failed offer
 * pushes and processes them on an interval. The job decision logic lives in
 * ./jobs and is unit-tested in isolation; this module wires it to Supabase.
 *
 * When Supabase env is not configured the worker starts cleanly and the tick
 * is a no-op (useful for local/dev without a database).
 */
const intervalMs = Number(optionalEnv("WORKER_INTERVAL_MS", "15000")) || 15000;
const pushEnabled = optionalEnv("EXPO_PUSH_ENABLED", "true") !== "false";
const pushUrl = optionalEnv("EXPO_PUSH_URL") || undefined;

function dbOrNull(): AppSupabaseClient | null {
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

/** Expire stale pending offers and escalate jobs with no remaining candidate. */
export async function pollOfferExpiry(db: AppSupabaseClient, now = Date.now()): Promise<void> {
  const { data } = await db
    .from("tow_job_offers" as never)
    .select("id, tow_job_id, driver_id, status, rank, expires_at")
    .eq("status", "pending");
  const offers = ((data as OfferRow[] | null) ?? []) as OfferRow[];
  if (offers.length === 0) return;

  const decision = evaluateOfferExpiry(offers, now);
  for (const id of decision.expire) {
    await db
      .from("tow_job_offers" as never)
      .update({ status: "expired" } as never)
      .eq("id", id);
  }
  for (const job of decision.perJob) {
    if (job.escalateToManualReview) {
      await db
        .from("tow_jobs" as never)
        .update({ status: "manual_review" } as never)
        .eq("id", job.towJobId)
        .is("driver_id", null);
      await db.from("tow_job_status_events" as never).insert({
        tow_job_id: job.towJobId,
        to_status: "manual_review",
        reason: "all offers expired",
      } as never);
    }
    // Remaining ranked offers stay pending and become the "next" candidate(s).
  }
}

/** Retry pushes for pending offers whose last push attempt failed. */
export async function pollOfferPushRetries(db: AppSupabaseClient): Promise<void> {
  if (!pushEnabled) return;
  const { data } = await db
    .from("tow_job_offers" as never)
    .select("tow_job_id, driver_id, tenant_id, status, push_status, push_attempts, expires_at")
    .eq("status", "pending")
    .in("push_status", ["failed", "pending"]);
  const offers = ((data as Array<OfferPushRow & { tenant_id: string; expires_at: string }> | null) ?? []);
  const retries = selectOfferPushRetries(offers);
  for (const retry of retries) {
    const { data: devices } = await db
      .from("driver_devices" as never)
      .select("expo_push_token")
      .eq("driver_id", retry.driverId);
    const tokens = ((devices as Array<{ expo_push_token: string }> | null) ?? []).map(
      (d) => d.expo_push_token,
    );
    const offer = offers.find((o) => o.tow_job_id === retry.towJobId && o.driver_id === retry.driverId);
    if (tokens.length === 0) {
      await db
        .from("tow_job_offers" as never)
        .update({ push_status: "skipped", push_attempts: retry.attempt } as never)
        .eq("tow_job_id", retry.towJobId)
        .eq("driver_id", retry.driverId);
      continue;
    }
    const messages = tokens.map((t) =>
      buildOfferPushMessage({
        expoPushToken: t,
        offerId: `${retry.towJobId}:${retry.driverId}`,
        towJobId: retry.towJobId,
        approxArea: "your area",
        problemType: "assistance",
        expiresAt: offer?.expires_at ?? new Date().toISOString(),
      }),
    );
    const res = await sendExpoPush(messages, { url: pushUrl });
    await db
      .from("tow_job_offers" as never)
      .update({
        push_status: res.ok ? "sent" : "failed",
        push_attempts: retry.attempt,
        push_sent_at: res.ok ? new Date().toISOString() : null,
        push_error: res.error ?? null,
      } as never)
      .eq("tow_job_id", retry.towJobId)
      .eq("driver_id", retry.driverId);
  }
}

async function tick(db: AppSupabaseClient | null): Promise<void> {
  if (!db) return;
  try {
    await pollOfferExpiry(db);
    await pollOfferPushRetries(db);
    await pollWebhookDeliveries(db);
  } catch (e) {
    console.error("[workers] tick error", e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  const db = dbOrNull();
  console.log(`[workers] starting, interval=${intervalMs}ms, db=${db ? "on" : "off"}`);
  for (;;) {
    await tick(db);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.env.NODE_ENV !== "test") {
  void main();
}
