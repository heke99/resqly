import { createServiceClient, type AppSupabaseClient } from "@resqly/database";
import { assertNoMockBankidInProduction, boolEnv, optionalEnv } from "@resqly/utils";
import {
  HttpSmsAdapter,
  ResendEmailAdapter,
  buildOfferPushMessage,
  resolveSmsConfig,
  sendExpoPush,
  type ChannelAdapter,
} from "@resqly/notifications";
import { MapsClient } from "@resqly/maps";
import { evaluateOfferExpiry, type OfferRow } from "./jobs/offer-expiry";
import { selectOfferPushRetries, type OfferPushRow } from "./jobs/offer-push";
import { pollWebhookDeliveries } from "./jobs/webhook-db-delivery";
import { pollOperationalNotificationQueue } from "./jobs/notification-queue-db";
import { pollOfferFallbacks } from "./jobs/offer-fallback-db";
import { pollEtaRefresh } from "./jobs/eta-refresh-db";

/**
 * Worker runner. Polls the database for due offer expiries, failed offer
 * pushes, SMS/manual-review fallbacks, ETA refreshes and webhook deliveries
 * and processes them on an interval. The job decision logic lives in ./jobs
 * and is unit-tested in isolation; this module wires it to Supabase.
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

function buildChannelAdapters(): Partial<Record<"sms" | "email", ChannelAdapter>> {
  const adapters: Partial<Record<"sms" | "email", ChannelAdapter>> = {};
  const sms = resolveSmsConfig();
  if (sms) {
    try {
      adapters.sms = new HttpSmsAdapter(sms);
    } catch (e) {
      console.error("[workers] SMS adapter disabled:", e instanceof Error ? e.message : e);
    }
  }
  const resendKey = optionalEnv("RESEND_API_KEY");
  const emailFrom = optionalEnv("EMAIL_FROM");
  if (boolEnv("NOTIFICATIONS_EMAIL_ENABLED", true) && resendKey && emailFrom) {
    adapters.email = new ResendEmailAdapter({
      apiKey: resendKey,
      from: emailFrom,
      replyTo: optionalEnv("EMAIL_REPLY_TO") || undefined,
    });
  }
  return adapters;
}

function buildMapsClient(): MapsClient {
  return new MapsClient({
    serverKey: optionalEnv("GOOGLE_MAPS_SERVER_KEY") || undefined,
    routesEnabled: boolEnv("GOOGLE_MAPS_ROUTES_API_ENABLED", true),
    routeMatrixEnabled: boolEnv("GOOGLE_MAPS_ROUTE_MATRIX_ENABLED", true),
    tenantId: "workers",
  });
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

/** Approximate pickup area (rounded coordinates — no exact address pre-accept). */
async function approxAreaForJob(db: AppSupabaseClient, towJobId: string): Promise<string> {
  const { data: job } = await db
    .from("tow_jobs" as never)
    .select("incident_id")
    .eq("id", towJobId)
    .maybeSingle();
  const incidentId = (job as { incident_id: string } | null)?.incident_id;
  if (!incidentId) return "okänt område";
  const { data: loc } = await db
    .from("incident_locations" as never)
    .select("lat, lng")
    .eq("incident_id", incidentId)
    .eq("kind", "pickup")
    .maybeSingle();
  const l = loc as { lat: number; lng: number } | null;
  return l ? `${l.lat.toFixed(1)}, ${l.lng.toFixed(1)}` : "okänt område";
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
    const approxArea = await approxAreaForJob(db, retry.towJobId);
    const messages = tokens.map((t) =>
      buildOfferPushMessage({
        expoPushToken: t,
        offerId: `${retry.towJobId}:${retry.driverId}`,
        towJobId: retry.towJobId,
        approxArea,
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

interface TickDeps {
  adapters: Partial<Record<"sms" | "email", ChannelAdapter>>;
  maps: MapsClient;
}

async function tick(db: AppSupabaseClient | null, deps: TickDeps): Promise<void> {
  if (!db) return;
  // Each job is individually guarded: one failing job must never take down
  // the loop or starve the other jobs.
  const jobs: Array<[string, () => Promise<void>]> = [
    ["offer-expiry", () => pollOfferExpiry(db)],
    ["offer-push-retry", () => pollOfferPushRetries(db)],
    ["offer-fallback", () => pollOfferFallbacks(db)],
    ["notification-queue", () => pollOperationalNotificationQueue(db, deps.adapters)],
    ["eta-refresh", () => pollEtaRefresh(db, deps.maps)],
    ["webhook-delivery", () => pollWebhookDeliveries(db)],
  ];
  for (const [name, run] of jobs) {
    try {
      await run();
    } catch (e) {
      console.error(`[workers] ${name} error`, e instanceof Error ? e.message : e);
    }
  }
}

async function main(): Promise<void> {
  // Hard production guard: never run with mock BankID config in production.
  assertNoMockBankidInProduction();
  const db = dbOrNull();
  const deps: TickDeps = { adapters: buildChannelAdapters(), maps: buildMapsClient() };
  console.log(
    `[workers] starting, interval=${intervalMs}ms, db=${db ? "on" : "off"}, sms=${deps.adapters.sms ? "on" : "off"}, email=${deps.adapters.email ? "on" : "off"}`,
  );
  for (;;) {
    await tick(db, deps);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.env.NODE_ENV !== "test") {
  void main();
}
