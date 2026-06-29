import { describe, expect, it } from "vitest";
import { filterCandidates, selectDispatch } from "./engine";
import type { DispatchCandidate, DispatchRequest } from "./types";

const base = (over: Partial<DispatchCandidate>): DispatchCandidate => ({
  driverId: "d",
  towCompanyId: "c",
  dutyStatus: "on_duty",
  distanceMeters: 1000,
  ...over,
});

describe("filterCandidates", () => {
  it("excludes busy and off-duty drivers", () => {
    const candidates = [
      base({ driverId: "ok" }),
      base({ driverId: "busy", isBusy: true }),
      base({ driverId: "off", dutyStatus: "off_duty" }),
    ];
    const req: DispatchRequest = { strategy: "eta_first", payerType: "customer_private", priority: "normal" };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["ok"]);
  });

  it("enforces capability requirements (EV, flatbed)", () => {
    const candidates = [
      base({ driverId: "ev", capabilities: { canHandleEv: true, hasFlatbed: true } }),
      base({ driverId: "noev", capabilities: { canHandleEv: false, hasFlatbed: true } }),
    ];
    const req: DispatchRequest = {
      strategy: "eta_first",
      payerType: "customer_private",
      priority: "normal",
      requirements: { needsEv: true, needsFlatbed: true },
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["ev"]);
  });

  it("restricts insurance cases to the preferred network", () => {
    const candidates = [
      base({ driverId: "pref", towCompanyId: "p1" }),
      base({ driverId: "other", towCompanyId: "x9" }),
    ];
    const req: DispatchRequest = {
      strategy: "insurance_preferred_network",
      payerType: "insurance_company",
      priority: "normal",
      preferredCompanyIds: ["p1"],
      allowMarketplaceFallback: false,
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["pref"]);
  });

  it("falls back to marketplace when preferred network empty and allowed", () => {
    const candidates = [base({ driverId: "other", towCompanyId: "x9" })];
    const req: DispatchRequest = {
      strategy: "insurance_preferred_network",
      payerType: "insurance_company",
      priority: "normal",
      preferredCompanyIds: ["p1"],
      allowMarketplaceFallback: true,
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["other"]);
  });

  it("only offers insurance jobs to companies with an active agreement (If-only)", () => {
    const candidates = [
      base({ driverId: "if_driver", towCompanyId: "if_partner" }),
      base({ driverId: "no_agreement", towCompanyId: "random_co" }),
    ];
    const req: DispatchRequest = {
      strategy: "eta_first",
      payerType: "insurance_company",
      priority: "normal",
      eligibleCompanyIds: ["if_partner"], // companies with an active If agreement
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["if_driver"]);
  });

  it("excludes a tow company without an If agreement from If jobs", () => {
    const candidates = [base({ driverId: "no_agreement", towCompanyId: "random_co" })];
    const req: DispatchRequest = {
      strategy: "eta_first",
      payerType: "insurance_company",
      priority: "normal",
      eligibleCompanyIds: ["if_partner"],
    };
    expect(filterCandidates(candidates, req)).toHaveLength(0);
  });

  it("only offers direct/private jobs to marketplace-enabled companies", () => {
    const candidates = [
      base({ driverId: "market_driver", towCompanyId: "market_co" }),
      base({ driverId: "closed_driver", towCompanyId: "closed_co" }),
    ];
    const req: DispatchRequest = {
      strategy: "eta_first",
      payerType: "customer_private",
      priority: "normal",
      eligibleCompanyIds: ["market_co"], // companies that accept direct orders
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["market_driver"]);
  });

  it("excludes offline drivers", () => {
    const candidates = [
      base({ driverId: "online", isOnline: true }),
      base({ driverId: "offline", isOnline: false }),
    ];
    const req: DispatchRequest = { strategy: "eta_first", payerType: "customer_private", priority: "normal" };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["online"]);
  });

  it("excludes drivers outside the coverage radius", () => {
    const candidates = [
      base({ driverId: "near", distanceMeters: 5000 }),
      base({ driverId: "far", distanceMeters: 80000 }),
    ];
    const req: DispatchRequest = {
      strategy: "nearest_available",
      payerType: "customer_private",
      priority: "normal",
      maxDistanceMeters: 50000,
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["near"]);
  });

  it("excludes drivers without the required vehicle capability", () => {
    const candidates = [
      base({ driverId: "ev_ok", capabilities: { canHandleEv: true } }),
      base({ driverId: "no_ev", capabilities: { canHandleEv: false } }),
    ];
    const req: DispatchRequest = {
      strategy: "eta_first",
      payerType: "insurance_company",
      priority: "normal",
      requirements: { needsEv: true },
      eligibleCompanyIds: ["c"],
    };
    expect(filterCandidates(candidates, req).map((c) => c.driverId)).toEqual(["ev_ok"]);
  });
});

describe("selectDispatch", () => {
  const candidates = [
    base({ driverId: "far", distanceMeters: 9000, etaSeconds: 900 }),
    base({ driverId: "near", distanceMeters: 1000, etaSeconds: 300 }),
    base({ driverId: "mid", distanceMeters: 5000, etaSeconds: 600 }),
  ];

  it("ranks by ETA for eta_first", () => {
    const r = selectDispatch(candidates, {
      strategy: "eta_first",
      payerType: "customer_private",
      priority: "normal",
      maxCandidates: 3,
    });
    expect(r.offers.map((o) => o.driverId)).toEqual(["near", "mid", "far"]);
    expect(r.offers[0]!.rank).toBe(0);
  });

  it("ranks by distance for nearest_available", () => {
    const r = selectDispatch(candidates, {
      strategy: "nearest_available",
      payerType: "customer_private",
      priority: "normal",
    });
    expect(r.offers[0]!.driverId).toBe("near");
  });

  it("uses eta for high priority regardless of nominal strategy", () => {
    const r = selectDispatch(candidates, {
      strategy: "cost_first",
      payerType: "customer_private",
      priority: "urgent",
    });
    expect(r.strategy).toBe("eta_first");
    expect(r.offers[0]!.driverId).toBe("near");
  });

  it("ranks by cost for cost_first", () => {
    const priced = [
      base({ driverId: "cheap", priceMinor: 1000 }),
      base({ driverId: "exp", priceMinor: 5000 }),
    ];
    const r = selectDispatch(priced, {
      strategy: "cost_first",
      payerType: "customer_private",
      priority: "normal",
    });
    expect(r.offers[0]!.driverId).toBe("cheap");
  });

  it("flags manual review when nobody is eligible", () => {
    const r = selectDispatch([base({ isBusy: true })], {
      strategy: "eta_first",
      payerType: "customer_private",
      priority: "normal",
    });
    expect(r.requiresManualReview).toBe(true);
    expect(r.offers).toHaveLength(0);
  });

  it("returns no automatic offers for manual_dispatch", () => {
    const r = selectDispatch(candidates, {
      strategy: "manual_dispatch",
      payerType: "customer_private",
      priority: "normal",
    });
    expect(r.offers).toHaveLength(0);
    expect(r.requiresManualReview).toBe(false);
  });
});
