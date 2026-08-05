import { createServiceClient, type AppSupabaseClient } from "@resqly/database";
import { assertNoMockBankidInProduction, boolEnv, isProductionEnv, optionalEnv } from "@resqly/utils";
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
import { pollDispatchRecovery } from "./jobs/dispatch-recovery-db";

/**
 * Worker runner. Polls the database for due offer expiries, failed offer
 * pushes, SMS/manual-review fallbacks, ETA refreshes and webhook deliveries
 * and processes them on an interval. The job decision logic lives in ./jobs
 * and is unit-tested in isolation; this module wires it to Supabase.
 *
 * In production the worker fails fast when Supabase is not configured. A live
 * process without a database is not a healthy worker and must never pass a
 * deployment health check.
 */
const intervalMs = Number(optionalEnv("WORKER_INTERVAL_MS", "15000")) || 15000;
const pushEnabled = optionalEnv("EXPO_PUSH_ENABLED", "true") !== "false";
const pushUrl = optionalEnv("EXPO_PUSH_URL") || undefined;

function dbOrNull(): AppSupabaseClient | null {
  const url = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    if (isProductionEnv()) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for workers in production");
    }
    return null;
  }
  return createServiceClient(url, key);
}

const workerInstanceId = optionalEnv(
  "WORKER_INSTANCE_ID",
  `${process.env.HOSTNAME ?? "local"}-${process.pid}`,
);

async function writeHeartbeat(
  db: AppSupabaseClient,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("worker_heartbeats" as never).upsert({
    worker_name: "resqly-main",
    instance_id: workerInstanceId,
    updated_at: new Date().toISOString(),
    ...patch,
  } as never, { onConflict: "worker_name" } as never);
  if (error) throw new Error(`worker heartbeat failed: ${error.message}`);
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
  const { data, error: offerLoadError } = await db
    .from("tow_job_offers" as never)
    .select("id, tow_job_id, driver_id, status, rank, expires_at, tenant_id")
    .eq("status", "pending");
  if (offerLoadError) throw new Error(`offer expiry load failed: ${offerLoadError.message}`);
  const offers = ((data as Array<OfferRow & { tenant_id: string }> | null) ?? []);
  if (offers.length === 0) return;

  const decision = evaluateOfferExpiry(offers, now);
  for (const id of decision.expire) {
    const { error: expireError } = await db
      .from("tow_job_offers" as never)
      .update({ status: "expired" } as never)
      .eq("id", id)
      .eq("status", "pending");
    if (expireError) throw new Error(`offer expiry failed: ${expireError.message}`);
  }
  for (const job of decision.perJob) {
    if (job.escalateToManualReview) {
      const tenantId = offers.find((offer) => offer.tow_job_id === job.towJobId)?.tenant_id;
      if (!tenantId) throw new Error(`offer expiry tenant missing for job ${job.towJobId}`);
      const { data: resultData, error: escalationError } = await db.rpc(
        "escalate_tow_job_manual_review" as never,
        {
          p_job: job.towJobId,
          p_tenant: tenantId,
          p_actor_user: null,
          p_reason: "all offers expired",
          p_review_reason: "Alla förarerbjudanden löpte ut utan acceptans",
          p_assign_to: null,
          p_actor_worker: "offer-expiry",
          p_actor_api_client: null,
        } as never,
      );
      if (escalationError) throw new Error(`offer expiry escalation failed: ${escalationError.message}`);
      const result = (Array.isArray(resultData) ? resultData[0] : resultData) as { error?: string } | null;
      if (result?.error && !["already_closed", "status_not_reviewable"].includes(result.error)) {
        throw new Error(`offer expiry escalation rejected: ${result.error}`);
      }
    }
    // Remaining ranked offers stay pending and become the "next" candidate(s).
  }
}

/** Approximate pickup area (rounded coordinates — no exact address pre-accept). */
async function approxAreaForJob(db: AppSupabaseClient, towJobId: string): Promise<string> {
  const { data: job, error: jobError } = await db
    .from("tow_jobs" as never)
    .select("incident_id")
    .eq("id", towJobId)
    .maybeSingle();
  if (jobError) throw new Error(`offer push job load failed: ${jobError.message}`);
  const incidentId = (job as { incident_id: string } | null)?.incident_id;
  if (!incidentId) return "okänt område";
  const { data: loc, error: locationError } = await db
    .from("incident_locations" as never)
    .select("lat, lng")
    .eq("incident_id", incidentId)
    .eq("kind", "pickup")
    .maybeSingle();
  if (locationError) throw new Error(`offer push location load failed: ${locationError.message}`);
  const l = loc as { lat: number; lng: number } | null;
  return l ? `${l.lat.toFixed(1)}, ${l.lng.toFixed(1)}` : "okänt område";
}

/** Retry pushes for pending offers whose last push attempt failed. */
export async function pollOfferPushRetries(db: AppSupabaseClient): Promise<void> {
  if (!pushEnabled) return;
  const { data, error: loadError } = await db
    .from("tow_job_offers" as never)
    .select("tow_job_id, driver_id, tenant_id, status, push_status, push_attempts, expires_at")
    .eq("status", "pending")
    .in("push_status", ["failed", "pending"]);
  if (loadError) throw new Error(`offer push retry load failed: ${loadError.message}`);
  const offers = ((data as Array<OfferPushRow & { tenant_id: string; expires_at: string }> | null) ?? []);
  const retries = selectOfferPushRetries(offers);
  for (const retry of retries) {
    const { data: devices, error: deviceError } = await db
      .from("driver_devices" as never)
      .select("expo_push_token")
      .eq("driver_id", retry.driverId);
    if (deviceError) throw new Error(`offer push device load failed: ${deviceError.message}`);
    const tokens = ((devices as Array<{ expo_push_token: string }> | null) ?? []).map(
      (d) => d.expo_push_token,
    );
    const offer = offers.find((o) => o.tow_job_id === retry.towJobId && o.driver_id === retry.driverId);
    if (tokens.length === 0) {
      const { error: skipError } = await db
        .from("tow_job_offers" as never)
        .update({ push_status: "skipped", push_attempts: retry.attempt } as never)
        .eq("tow_job_id", retry.towJobId)
        .eq("driver_id", retry.driverId);
      if (skipError) throw new Error(`offer push skip update failed: ${skipError.message}`);
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
    const { error: updateError } = await db
      .from("tow_job_offers" as never)
      .update({
        push_status: res.ok ? "sent" : "failed",
        push_attempts: retry.attempt,
        push_sent_at: res.ok ? new Date().toISOString() : null,
        push_error: res.error ?? null,
      } as never)
      .eq("tow_job_id", retry.towJobId)
      .eq("driver_id", retry.driverId);
    if (updateError) throw new Error(`offer push retry update failed: ${updateError.message}`);
  }
}

interface TickDeps {
  adapters: Partial<Record<"sms" | "email", ChannelAdapter>>;
  maps: MapsClient;
}

async function tick(db: AppSupabaseClient, deps: TickDeps): Promise<void> {
  const failures: string[] = [];
  const jobs: Array<[string, () => Promise<void>]> = [
    ["dispatch-recovery", () => pollDispatchRecovery(db, { pushEnabled, pushUrl })],
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
      const message = e instanceof Error ? e.message : String(e);
      failures.push(`${name}: ${message}`);
      console.error(`[workers] ${name} error`, message);
    }
  }

  const now = new Date().toISOString();
  if (failures.length > 0) {
    await writeHeartbeat(db, {
      status: "degraded",
      last_failed_at: now,
      last_error: failures.join(" | ").slice(0, 4000),
    });
    return;
  }
  await writeHeartbeat(db, {
    status: "running",
    last_succeeded_at: now,
    last_error: null,
  });
}

async function main(): Promise<void> {
  // Hard production guard: never run with mock BankID config in production.
  assertNoMockBankidInProduction();
  const db = dbOrNull();
  if (!db) {
    console.warn("[workers] database is not configured; local worker exits instead of reporting a false healthy state");
    return;
  }
  const deps: TickDeps = { adapters: buildChannelAdapters(), maps: buildMapsClient() };
  await writeHeartbeat(db, {
    status: "starting",
    last_started_at: new Date().toISOString(),
    last_error: null,
  });
  console.log(
    `[workers] starting, interval=${intervalMs}ms, db=on, sms=${deps.adapters.sms ? "on" : "off"}, email=${deps.adapters.email ? "on" : "off"}`,
  );
  for (;;) {
    await tick(db, deps);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

if (process.env.NODE_ENV !== "test") {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[workers] fatal startup/runtime error", message);
    process.exitCode = 1;
  });
}
