export interface OfferRow {
  id: string;
  tow_job_id: string;
  driver_id: string;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  rank: number;
  expires_at: string;
}

export interface ExpiryDecision {
  /** Offer ids to mark expired. */
  expire: string[];
  /** Per job: whether a next candidate exists or it must escalate. */
  perJob: Array<{ towJobId: string; escalateToManualReview: boolean; nextDriverId: string | null }>;
}

/**
 * Decide which pending offers have expired and, per job, whether to re-offer to
 * the next-ranked candidate or escalate to manual_review. Accepted jobs are left
 * untouched.
 */
export function evaluateOfferExpiry(offers: OfferRow[], now: number): ExpiryDecision {
  const byJob = new Map<string, OfferRow[]>();
  for (const o of offers) {
    if (!byJob.has(o.tow_job_id)) byJob.set(o.tow_job_id, []);
    byJob.get(o.tow_job_id)!.push(o);
  }

  const expire: string[] = [];
  const perJob: ExpiryDecision["perJob"] = [];

  for (const [towJobId, jobOffers] of byJob) {
    if (jobOffers.some((o) => o.status === "accepted")) continue;

    const expiredNow = jobOffers.filter(
      (o) => o.status === "pending" && Date.parse(o.expires_at) <= now,
    );
    for (const o of expiredNow) expire.push(o.id);

    const expiredIds = new Set(expiredNow.map((o) => o.id));
    const remaining = jobOffers
      .filter((o) => o.status === "pending" && !expiredIds.has(o.id))
      .sort((a, b) => a.rank - b.rank);

    if (expiredNow.length > 0) {
      perJob.push({
        towJobId,
        escalateToManualReview: remaining.length === 0,
        nextDriverId: remaining[0]?.driver_id ?? null,
      });
    }
  }

  return { expire, perJob };
}
