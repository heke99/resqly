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
