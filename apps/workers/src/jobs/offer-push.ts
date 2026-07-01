export interface OfferPushRow {
  tow_job_id: string;
  driver_id: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  push_status: "pending" | "sent" | "failed" | "skipped";
  push_attempts: number;
}

export interface OfferPushRetry {
  towJobId: string;
  driverId: string;
  attempt: number;
}

export interface OfferFallbackPolicy {
  pushTimeoutSeconds: number;
  pushMaxAttempts: number;
  smsFallbackEnabled: boolean;
  manualReviewAfterMinutes: number;
  /** Never expose customer name/phone/location in operational SMS by default. */
  exposeSensitiveDataInSms?: boolean;
}

export interface OfferFallbackRow extends OfferPushRow {
  offered_at: string;
  tow_vehicle_id?: string | null;
  tow_company_id?: string | null;
  payer_type?: "insurance_company" | "private" | string;
}

export interface OfferFallbackAction {
  towJobId: string;
  driverId: string;
  channel: "push" | "sms" | "manual_review";
  reason: string;
  sensitivePayloadAllowed: boolean;
}

/**
 * Decide which still-pending offers need a push (re)try. Only offers whose
 * underlying offer is still pending and whose last push attempt failed (and is
 * under the attempt cap) are retried. Sent/skipped offers are left alone.
 */
export function selectOfferPushRetries(
  offers: OfferPushRow[],
  maxAttempts = 3,
): OfferPushRetry[] {
  const retries: OfferPushRetry[] = [];
  for (const o of offers) {
    if (o.status !== "pending") continue;
    const needs = o.push_status === "failed" || o.push_status === "pending";
    if (!needs) continue;
    if (o.push_attempts >= maxAttempts) continue;
    retries.push({ towJobId: o.tow_job_id, driverId: o.driver_id, attempt: o.push_attempts + 1 });
  }
  return retries;
}

/**
 * P1/P2 fallback selector. It does not decide candidate eligibility — that is
 * already enforced by dispatch SQL. It only decides whether a still-pending
 * authorised offer should receive another push, an operational SMS fallback, or
 * be escalated to manual review.
 */
export function selectOfferFallbackActions(
  offers: OfferFallbackRow[],
  policy: OfferFallbackPolicy,
  nowMs = Date.now(),
): OfferFallbackAction[] {
  const actions: OfferFallbackAction[] = [];
  for (const offer of offers) {
    if (offer.status !== "pending") continue;
    const offeredAt = Date.parse(offer.offered_at);
    const ageSeconds = Number.isFinite(offeredAt) ? Math.max(0, Math.floor((nowMs - offeredAt) / 1000)) : 0;

    if (offer.push_status !== "sent" && offer.push_attempts < policy.pushMaxAttempts) {
      actions.push({
        towJobId: offer.tow_job_id,
        driverId: offer.driver_id,
        channel: "push",
        reason: "push_retry",
        sensitivePayloadAllowed: false,
      });
      continue;
    }

    if (policy.smsFallbackEnabled && ageSeconds >= policy.pushTimeoutSeconds) {
      actions.push({
        towJobId: offer.tow_job_id,
        driverId: offer.driver_id,
        channel: "sms",
        reason: "push_timeout_sms_fallback",
        sensitivePayloadAllowed: Boolean(policy.exposeSensitiveDataInSms),
      });
      continue;
    }

    if (ageSeconds >= policy.manualReviewAfterMinutes * 60) {
      actions.push({
        towJobId: offer.tow_job_id,
        driverId: offer.driver_id,
        channel: "manual_review",
        reason: "no_accept_after_fallback_window",
        sensitivePayloadAllowed: false,
      });
    }
  }
  return actions;
}
