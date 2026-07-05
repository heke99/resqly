import type { InvoiceLineType, PayerType } from "@resqly/types";

export interface PriceList {
  start_fee_minor: number;
  per_km_minor: number;
  per_waiting_minute_minor: number;
  failed_trip_minor: number;
  on_call_surcharge_minor: number;
  heavy_tow_minor: number;
  /** Private marketplace pricing factors (0023). All optional for old rows. */
  minimum_price_minor?: number;
  evening_night_surcharge_minor?: number;
  weekend_surcharge_minor?: number;
  cancellation_policy?: string | null;
  currency?: string;
}

export interface InvoiceBasisInput {
  payerType: PayerType;
  priceList: PriceList;
  distanceKm?: number;
  waitingMinutes?: number;
  failedTrip?: boolean;
  onCall?: boolean;
  heavyTow?: boolean;
  /** Evening/night (jour) pickup — surcharge from the price list applies. */
  eveningNight?: boolean;
  /** Weekend pickup — surcharge from the price list applies. */
  weekend?: boolean;
  specialVehicleMinor?: number;
  extraEquipmentMinor?: number;
  otherCostsMinor?: number;
  /** VAT rate as a fraction, e.g. 0.25 for 25%. */
  vatRate?: number;
}

export interface InvoiceLineRow {
  type: InvoiceLineType;
  description: string;
  quantity: number;
  unit_amount_minor: number;
  total_minor: number;
}

export interface InvoiceBasisResult {
  payer_type: PayerType;
  lines: InvoiceLineRow[];
  subtotal_minor: number;
  vat_minor: number;
  total_minor: number;
  currency: string;
}

/**
 * Build the invoice basis for a completed tow job from the price list and the
 * completion report figures. This is the billing FOUNDATION — payment capture
 * (card/Swish/invoice) is a separate, later integration.
 */
export function buildInvoiceBasis(input: InvoiceBasisInput): InvoiceBasisResult {
  const { priceList } = input;
  const lines: InvoiceLineRow[] = [];
  const push = (type: InvoiceLineType, description: string, quantity: number, unit: number) => {
    if (unit === 0 && quantity === 0) return;
    const total = Math.round(unit * quantity);
    if (total === 0 && type !== "start_fee") return;
    lines.push({ type, description, quantity, unit_amount_minor: unit, total_minor: total });
  };

  push("start_fee", "Start fee", 1, priceList.start_fee_minor);

  const km = input.distanceKm ?? 0;
  if (km > 0) push("kilometers", "Distance", Math.round(km), priceList.per_km_minor);

  const waiting = input.waitingMinutes ?? 0;
  if (waiting > 0) push("waiting_time", "Waiting time", waiting, priceList.per_waiting_minute_minor);

  if (input.failedTrip) push("failed_trip", "Failed trip / no-show", 1, priceList.failed_trip_minor);
  if (input.onCall) push("on_call_surcharge", "On-call surcharge", 1, priceList.on_call_surcharge_minor);
  if (input.eveningNight)
    push("evening_night_surcharge", "Evening/night surcharge", 1, priceList.evening_night_surcharge_minor ?? 0);
  if (input.weekend) push("weekend_surcharge", "Weekend surcharge", 1, priceList.weekend_surcharge_minor ?? 0);
  if (input.heavyTow) push("heavy_towing", "Heavy towing", 1, priceList.heavy_tow_minor);
  if (input.specialVehicleMinor) push("special_vehicle", "Special vehicle", 1, input.specialVehicleMinor);
  if (input.extraEquipmentMinor) push("extra_equipment", "Extra equipment", 1, input.extraEquipmentMinor);
  if (input.otherCostsMinor) push("other", "Other costs", 1, input.otherCostsMinor);

  let subtotal = lines.reduce((sum, l) => sum + l.total_minor, 0);

  // A configured minimum price raises the total but never lowers it.
  const minimum = priceList.minimum_price_minor ?? 0;
  if (minimum > subtotal) {
    push("minimum_price_adjustment", "Minimum price", 1, minimum - subtotal);
    subtotal = minimum;
  }

  const vatRate = input.vatRate ?? 0.25;
  const vat = Math.round(subtotal * vatRate);

  return {
    payer_type: input.payerType,
    lines,
    subtotal_minor: subtotal,
    vat_minor: vat,
    total_minor: subtotal + vat,
    currency: priceList.currency ?? "SEK",
  };
}

// ---------------------------------------------------------------------------
// Private/direct towing price estimation
// ---------------------------------------------------------------------------

export interface PrivatePriceFactors {
  evening_night: boolean;
  weekend: boolean;
  distance_km: number | null;
}

export interface PrivatePriceEstimate extends InvoiceBasisResult {
  factors: PrivatePriceFactors;
}

/** Swedish local time drives evening/weekend surcharges regardless of server TZ. */
export function swedishTimeFactors(when: Date): { eveningNight: boolean; weekend: boolean } {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(when);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const weekend = weekday.startsWith("lör") || weekday.startsWith("sön");
  const eveningNight = hour < 7 || hour >= 18;
  return { eveningNight, weekend };
}

/**
 * Estimate what a private/direct tow will cost with a given price list.
 * Used for the customer's price preview AND for the immutable snapshot taken
 * when a driver accepts, so both always agree on the calculation.
 */
export function estimatePrivateTowPrice(input: {
  priceList: PriceList;
  distanceKm: number | null;
  when?: Date;
  heavyTow?: boolean;
}): PrivatePriceEstimate {
  const { eveningNight, weekend } = swedishTimeFactors(input.when ?? new Date());
  const basis = buildInvoiceBasis({
    payerType: "customer_private",
    priceList: input.priceList,
    distanceKm: input.distanceKm ?? 0,
    eveningNight,
    weekend,
    heavyTow: input.heavyTow ?? false,
  });
  return {
    ...basis,
    factors: { evening_night: eveningNight, weekend, distance_km: input.distanceKm },
  };
}
