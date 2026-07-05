import { describe, expect, it } from "vitest";
import { buildInvoiceBasis, estimatePrivateTowPrice, swedishTimeFactors, type PriceList } from "./index";

const priceList: PriceList = {
  start_fee_minor: 50000,
  per_km_minor: 2500,
  per_waiting_minute_minor: 1000,
  failed_trip_minor: 40000,
  on_call_surcharge_minor: 30000,
  heavy_tow_minor: 100000,
  currency: "SEK",
};

describe("buildInvoiceBasis", () => {
  it("adds distance and waiting lines and computes 25% VAT", () => {
    const basis = buildInvoiceBasis({
      payerType: "insurance_company",
      priceList,
      distanceKm: 10,
      waitingMinutes: 5,
    });
    // 50000 + 10*2500 + 5*1000 = 80000
    expect(basis.subtotal_minor).toBe(80000);
    expect(basis.vat_minor).toBe(20000);
    expect(basis.total_minor).toBe(100000);
    expect(basis.lines.map((l) => l.type)).toEqual(["start_fee", "kilometers", "waiting_time"]);
  });

  it("includes failed trip and surcharges when set", () => {
    const basis = buildInvoiceBasis({
      payerType: "customer_private",
      priceList,
      failedTrip: true,
      onCall: true,
      heavyTow: true,
    });
    const types = basis.lines.map((l) => l.type);
    expect(types).toContain("failed_trip");
    expect(types).toContain("on_call_surcharge");
    expect(types).toContain("heavy_towing");
  });

  it("always keeps a start fee even at zero distance", () => {
    const basis = buildInvoiceBasis({ payerType: "insurance_company", priceList });
    expect(basis.lines[0]!.type).toBe("start_fee");
  });

  it("raises the total to the configured minimum price", () => {
    const basis = buildInvoiceBasis({
      payerType: "customer_private",
      priceList: { ...priceList, minimum_price_minor: 120000 },
      distanceKm: 2, // 50000 + 5000 = 55000 < 120000
    });
    expect(basis.subtotal_minor).toBe(120000);
    expect(basis.lines.map((l) => l.type)).toContain("minimum_price_adjustment");
  });

  it("never lowers a total above the minimum price", () => {
    const basis = buildInvoiceBasis({
      payerType: "customer_private",
      priceList: { ...priceList, minimum_price_minor: 10000 },
      distanceKm: 100,
    });
    expect(basis.subtotal_minor).toBe(300000);
    expect(basis.lines.map((l) => l.type)).not.toContain("minimum_price_adjustment");
  });

  it("adds evening/night and weekend surcharges when flagged", () => {
    const basis = buildInvoiceBasis({
      payerType: "customer_private",
      priceList: { ...priceList, evening_night_surcharge_minor: 25000, weekend_surcharge_minor: 15000 },
      eveningNight: true,
      weekend: true,
    });
    const types = basis.lines.map((l) => l.type);
    expect(types).toContain("evening_night_surcharge");
    expect(types).toContain("weekend_surcharge");
  });
});

describe("swedishTimeFactors", () => {
  it("flags a Saturday night as evening + weekend", () => {
    // 2026-01-03 is a Saturday; 22:30 UTC = 23:30 in Stockholm.
    const f = swedishTimeFactors(new Date("2026-01-03T22:30:00Z"));
    expect(f.weekend).toBe(true);
    expect(f.eveningNight).toBe(true);
  });

  it("flags a Tuesday midday as neither", () => {
    // 2026-01-06 is a Tuesday; 11:00 UTC = 12:00 in Stockholm.
    const f = swedishTimeFactors(new Date("2026-01-06T11:00:00Z"));
    expect(f.weekend).toBe(false);
    expect(f.eveningNight).toBe(false);
  });
});

describe("estimatePrivateTowPrice", () => {
  it("produces a deterministic estimate with factors", () => {
    const estimate = estimatePrivateTowPrice({
      priceList: { ...priceList, minimum_price_minor: 0 },
      distanceKm: 20,
      when: new Date("2026-01-06T11:00:00Z"),
    });
    // 50000 + 20*2500 = 100000, VAT 25000
    expect(estimate.subtotal_minor).toBe(100000);
    expect(estimate.total_minor).toBe(125000);
    expect(estimate.factors).toEqual({ evening_night: false, weekend: false, distance_km: 20 });
  });
});
