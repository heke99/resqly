import { describe, expect, it } from "vitest";
import { processDelivery } from "./jobs/webhook-delivery";
import { evaluateOfferExpiry, type OfferRow } from "./jobs/offer-expiry";
import { jobsNeedingEtaRefresh } from "./jobs/eta-refresh";

describe("webhook delivery", () => {
  it("marks succeeded on a successful send", async () => {
    const r = await processDelivery({ id: "d1", attempts: 0, status: "pending" }, async () => ({ ok: true }));
    expect(r.status).toBe("succeeded");
    expect(r.nextAttemptAt).toBeNull();
  });
  it("schedules a retry on failure", async () => {
    const r = await processDelivery(
      { id: "d1", attempts: 0, status: "pending" },
      async () => ({ ok: false, error: "500" }),
      { now: 0 },
    );
    expect(r.status).toBe("failed");
    expect(r.nextAttemptAt).not.toBeNull();
  });
  it("exhausts after max attempts", async () => {
    const r = await processDelivery(
      { id: "d1", attempts: 5, status: "failed" },
      async () => ({ ok: false }),
      { maxAttempts: 6 },
    );
    expect(r.status).toBe("exhausted");
  });
  it("treats a thrown error as a failure", async () => {
    const r = await processDelivery({ id: "d1", attempts: 0, status: "pending" }, async () => {
      throw new Error("network");
    });
    expect(r.status).toBe("failed");
    expect(r.error).toBe("network");
  });
});

describe("offer expiry", () => {
  const offer = (over: Partial<OfferRow>): OfferRow => ({
    id: "o",
    tow_job_id: "j1",
    driver_id: "d",
    status: "pending",
    rank: 0,
    expires_at: new Date(0).toISOString(),
    ...over,
  });

  it("expires past offers and re-offers to the next candidate", () => {
    const now = 10_000;
    const offers = [
      offer({ id: "o1", driver_id: "d1", rank: 0, expires_at: new Date(0).toISOString() }),
      offer({ id: "o2", driver_id: "d2", rank: 1, expires_at: new Date(now + 60_000).toISOString() }),
    ];
    const decision = evaluateOfferExpiry(offers, now);
    expect(decision.expire).toEqual(["o1"]);
    expect(decision.perJob[0]).toMatchObject({ escalateToManualReview: false, nextDriverId: "d2" });
  });

  it("escalates to manual review when all offers expired", () => {
    const now = 10_000;
    const offers = [offer({ id: "o1", expires_at: new Date(0).toISOString() })];
    const decision = evaluateOfferExpiry(offers, now);
    expect(decision.perJob[0]?.escalateToManualReview).toBe(true);
  });

  it("ignores jobs that already have an accepted offer", () => {
    const offers = [
      offer({ id: "o1", status: "accepted" }),
      offer({ id: "o2", status: "pending", expires_at: new Date(0).toISOString() }),
    ];
    expect(evaluateOfferExpiry(offers, 10_000).expire).toEqual([]);
  });
});

describe("eta refresh", () => {
  it("selects tracked jobs that are due or never updated", () => {
    const now = 100_000;
    const due = jobsNeedingEtaRefresh(
      [
        { towJobId: "j1", status: "driver_en_route", lastEtaAt: null },
        { towJobId: "j2", status: "driver_en_route", lastEtaAt: now - 5_000 },
        { towJobId: "j3", status: "closed", lastEtaAt: null },
        { towJobId: "j4", status: "transporting", lastEtaAt: now - 120_000 },
      ],
      now,
      60,
    );
    expect(due).toContain("j1");
    expect(due).toContain("j4");
    expect(due).not.toContain("j2");
    expect(due).not.toContain("j3");
  });
});
