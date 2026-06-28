import { describe, expect, it } from "vitest";
import { buildInvoiceBasis, type PriceList } from "./index";

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
});
