import { describe, expect, it } from "vitest";
import { filterCandidates, selectDispatch } from "./engine";
import type { DispatchCandidate, DispatchRequest } from "./types";

const base = (over: Partial<DispatchCandidate>): DispatchCandidate => ({
  driverId: "d",
  towCompanyId: "c",
  dutyStatus: "on_duty",
  distanceMeters: 1000,
  marketplaceEnabled: true,
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

  it("restricts insurance cases to contracted towing companies", () => {
    const candidates = [
      base({ driverId: "pref", towCompanyId: "p1", insuranceAgreementId: "a1", inPreferredNetwork: true }),
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

  it("can offer to the next approved contracted towing company", () => {
    const candidates = [base({ driverId: "other", towCompanyId: "x9", insuranceAgreementId: "a2", inPreferredNetwork: true })];
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
      base({ driverId: "if_driver", towCompanyId: "if_partner", insuranceAgreementId: "if_agreement", inPreferredNetwork: true }),
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
      base({ driverId: "market_driver", towCompanyId: "market_co", marketplaceEnabled: true }),
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
      base({ driverId: "ev_ok", capabilities: { canHandleEv: true }, insuranceAgreementId: "a1", inPreferredNetwork: true }),
      base({ driverId: "no_ev", capabilities: { canHandleEv: false }, insuranceAgreementId: "a1", inPreferredNetwork: true }),
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
    base({ driverId: "far", distanceMeters: 9000, etaSeconds: 900, marketplaceEnabled: true }),
    base({ driverId: "near", distanceMeters: 1000, etaSeconds: 300, marketplaceEnabled: true }),
    base({ driverId: "mid", distanceMeters: 5000, etaSeconds: 600, marketplaceEnabled: true }),
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


  it("broadcasts insurance jobs to every contracted eligible tow vehicle in range", () => {
    const contracted = [
      base({ driverId: "d1", towCompanyId: "if_partner", towVehicleId: "truck1", distanceMeters: 1000, insuranceAgreementId: "a1", inPreferredNetwork: true }),
      base({ driverId: "d2", towCompanyId: "if_partner", towVehicleId: "truck2", distanceMeters: 2500, insuranceAgreementId: "a1", inPreferredNetwork: true }),
      base({ driverId: "d3", towCompanyId: "other_contract", towVehicleId: "truck3", distanceMeters: 3000, insuranceAgreementId: "a2", inPreferredNetwork: true }),
      base({ driverId: "open_market", towCompanyId: "market_only", towVehicleId: "truck4", distanceMeters: 500, marketplaceEnabled: true }),
    ];
    const r = selectDispatch(contracted, {
      strategy: "insurance_preferred_network",
      payerType: "insurance_company",
      priority: "normal",
      maxCandidates: 1,
      maxDistanceMeters: 10000,
    });
    expect(r.offers.map((o) => o.driverId)).toEqual(["d1", "d2", "d3"]);
    expect(r.offers.map((o) => o.towVehicleId)).toEqual(["truck1", "truck2", "truck3"]);
  });

  it("limits direct/private jobs to nearest marketplace vehicles first", () => {
    const market = [
      base({ driverId: "far", towCompanyId: "market", distanceMeters: 9000, marketplaceEnabled: true }),
      base({ driverId: "near", towCompanyId: "market", distanceMeters: 1000, marketplaceEnabled: true }),
      base({ driverId: "closed", towCompanyId: "closed", distanceMeters: 100, marketplaceEnabled: false }),
    ];
    const r = selectDispatch(market, {
      strategy: "nearest_available",
      payerType: "customer_private",
      priority: "normal",
      maxCandidates: 1,
      eligibleCompanyIds: ["market"],
    });
    expect(r.offers.map((o) => o.driverId)).toEqual(["near"]);
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
