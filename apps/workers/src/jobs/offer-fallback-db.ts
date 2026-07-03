import type { AppSupabaseClient } from "@resqly/database";
import { selectOfferFallbackActions, type OfferFallbackRow } from "./offer-push";

interface FallbackRuleRow {
  tenant_id: string;
  job_scope: "insurance" | "private" | "all";
  enabled: boolean;
  push_timeout_seconds: number;
  push_max_attempts: number;
  sms_fallback_enabled: boolean;
  operational_contacts: Array<{ name?: string; phone?: string; email?: string }>;
  expose_sensitive_data_in_sms: boolean;
  manual_review_after_minutes: number;
}

/**
 * Connect the push-retry pipeline to the SMS/manual-review fallback:
 * for each tenant with an enabled fallback rule, still-pending offers that
 * have exhausted push delivery get an operational SMS to the tenant's
 * on-call contacts, and offers past the manual-review window escalate the
 * job to manual help. Eligibility is never widened here — the offers were
 * created by contract-safe dispatch.
 *
 * Idempotent: an offer only ever gets one queue row per channel+recipient,
 * and manual review rows are unique per tow job.
 */
export async function pollOfferFallbacks(
  db: AppSupabaseClient,
  opts: { now?: Date } = {},
): Promise<void> {
  const nowMs = (opts.now ?? new Date()).getTime();

  const { data: ruleRows } = await db
    .from("tenant_notification_fallback_rules" as never)
    .select("*")
    .eq("enabled", true);
  const rules = ((ruleRows as FallbackRuleRow[] | null) ?? []) as FallbackRuleRow[];
  if (rules.length === 0) return;

  for (const rule of rules) {
    const { data: offerRows } = await db
      .from("tow_job_offers" as never)
      .select("id, tow_job_id, driver_id, tow_company_id, tow_vehicle_id, status, push_status, push_attempts, offered_at, tenant_id")
      .eq("tenant_id", rule.tenant_id)
      .eq("status", "pending");
    const offers = ((offerRows as Array<OfferFallbackRow & { id: string; tenant_id: string }> | null) ?? []);
    if (offers.length === 0) continue;

    const actions = selectOfferFallbackActions(offers, {
      pushTimeoutSeconds: rule.push_timeout_seconds,
      pushMaxAttempts: rule.push_max_attempts,
      smsFallbackEnabled: rule.sms_fallback_enabled,
      manualReviewAfterMinutes: rule.manual_review_after_minutes,
      exposeSensitiveDataInSms: rule.expose_sensitive_data_in_sms,
    }, nowMs);

    for (const action of actions) {
      const offer = offers.find((o) => o.tow_job_id === action.towJobId && o.driver_id === action.driverId);
      if (!offer) continue;

      if (action.channel === "sms") {
        const contacts = (rule.operational_contacts ?? []).filter((c) => c.phone);
        for (const contact of contacts) {
          // One SMS per offer + recipient, ever.
          const { data: existing } = await db
            .from("operational_notification_queue" as never)
            .select("id")
            .eq("offer_id", offer.id)
            .eq("channel", "sms")
            .eq("recipient", contact.phone!)
            .limit(1);
          if (((existing as unknown[] | null) ?? []).length > 0) continue;
          await db.from("operational_notification_queue" as never).insert({
            tenant_id: rule.tenant_id,
            tow_job_id: offer.tow_job_id,
            offer_id: offer.id,
            driver_id: offer.driver_id,
            tow_vehicle_id: offer.tow_vehicle_id ?? null,
            channel: "sms",
            recipient: contact.phone!,
            template_key: "offer_push_fallback",
            // Operational payload only — never customer PII.
            payload: { reason: action.reason },
            status: "pending",
            next_attempt_at: new Date().toISOString(),
          } as never);
        }
      }

      if (action.channel === "manual_review") {
        // Only escalate jobs that are still unassigned.
        const { data: jobRow } = await db
          .from("tow_jobs" as never)
          .select("id, status, driver_id, incident_id")
          .eq("id", offer.tow_job_id)
          .maybeSingle();
        const job = jobRow as { id: string; status: string; driver_id: string | null; incident_id: string } | null;
        if (!job || job.driver_id || !["offered", "matching"].includes(job.status)) continue;

        const { data: existingReview } = await db
          .from("manual_reviews" as never)
          .select("id")
          .eq("tow_job_id", job.id)
          .eq("status", "open")
          .limit(1);
        if (((existingReview as unknown[] | null) ?? []).length > 0) continue;

        await db
          .from("tow_jobs" as never)
          .update({ status: "manual_review" } as never)
          .eq("id", job.id)
          .is("driver_id", null);
        await db.from("tow_job_status_events" as never).insert({
          tow_job_id: job.id,
          from_status: job.status,
          to_status: "manual_review",
          reason: "ingen bärgare svarade inom tidsgränsen",
        } as never);
        await db.from("manual_reviews" as never).insert({
          tenant_id: rule.tenant_id,
          incident_id: job.incident_id,
          tow_job_id: job.id,
          reason: "Ingen bärgare accepterade uppdraget inom tidsgränsen",
          status: "open",
        } as never);
      }
    }
  }
}
