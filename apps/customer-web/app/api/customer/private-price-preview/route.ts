import { NextResponse } from "next/server";
import { estimatePrivateTowPrice, type PriceList } from "@resqly/billing";
import { haversineMeters } from "@resqly/maps";
import { requireCustomer, jsonError } from "../_lib";

interface PreviewEstimate {
  company_name: string;
  total_minor: number;
  currency: string;
  lines: Array<{ type: string; description: string; total_minor: number }>;
  cancellation_policy: string | null;
}

/**
 * Price preview for private/direct towing. Estimates what eligible
 * marketplace companies would charge for pickup -> destination based on
 * their configured price lists. Estimates only — waiting time and extra
 * work can affect the final price (which is frozen when a driver accepts).
 */
export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db } = session;

  const body = (await request.json().catch(() => ({}))) as {
    pickup?: { lat?: unknown; lng?: unknown } | null;
    address?: unknown;
    destination?: unknown;
  };

  let pickup: { lat: number; lng: number } | null = null;
  if (body.pickup && Number.isFinite(Number(body.pickup.lat)) && Number.isFinite(Number(body.pickup.lng))) {
    pickup = { lat: Number(body.pickup.lat), lng: Number(body.pickup.lng) };
  } else if (typeof body.address === "string" && body.address.trim()) {
    pickup = await tryGeocode(body.address.trim());
  }

  let destination: { lat: number; lng: number } | null = null;
  if (typeof body.destination === "string" && body.destination.trim()) {
    destination = await tryGeocode(body.destination.trim());
  } else if (body.destination && typeof body.destination === "object") {
    const d = body.destination as { lat?: unknown; lng?: unknown };
    if (Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng))) {
      destination = { lat: Number(d.lat), lng: Number(d.lng) };
    }
  }

  // Road distance approximation (haversine + road factor) — good enough for
  // an honest "from …" estimate without spending Routes quota per preview.
  const distanceKm =
    pickup && destination ? Math.round((haversineMeters(pickup, destination) * 1.3) / 100) / 10 : null;

  // Eligible marketplace companies with active pricing.
  const { data: settings } = await db
    .from("tow_company_marketplace_settings" as never)
    .select("tow_company_id, min_price_minor, tow_companies(name, active)")
    .eq("accepts_direct_orders", true)
    .eq("active", true);
  const companies = ((settings as Array<{
    tow_company_id: string;
    min_price_minor: number | null;
    tow_companies: { name?: string; active?: boolean } | null;
  }> | null) ?? []).filter((c) => c.tow_companies?.active !== false);

  if (companies.length === 0) {
    return jsonError(409, "Privat bärgning är inte tillgänglig ännu i ditt område.");
  }

  const { data: priceRows } = await db
    .from("tow_price_lists" as never)
    .select(
      "tow_company_id, start_fee_minor, per_km_minor, per_waiting_minute_minor, failed_trip_minor, on_call_surcharge_minor, heavy_tow_minor, minimum_price_minor, evening_night_surcharge_minor, weekend_surcharge_minor, cancellation_policy, currency, created_at",
    )
    .in("tow_company_id", companies.map((c) => c.tow_company_id))
    .eq("active", true)
    .order("created_at", { ascending: false });
  const priceByCompany = new Map<string, PriceList & { cancellation_policy?: string | null }>();
  for (const row of (priceRows as Array<PriceList & { tow_company_id: string }> | null) ?? []) {
    if (!priceByCompany.has(row.tow_company_id)) priceByCompany.set(row.tow_company_id, row);
  }

  const now = new Date();
  const estimates: PreviewEstimate[] = [];
  let withoutPricing = 0;
  let factors: { evening_night: boolean; weekend: boolean } | null = null;
  for (const company of companies) {
    const priceList = priceByCompany.get(company.tow_company_id);
    if (!priceList) {
      withoutPricing += 1;
      continue;
    }
    // The marketplace-level minimum also applies when higher.
    const effective: PriceList = {
      ...priceList,
      minimum_price_minor: Math.max(priceList.minimum_price_minor ?? 0, company.min_price_minor ?? 0),
    };
    const estimate = estimatePrivateTowPrice({ priceList: effective, distanceKm, when: now });
    factors = { evening_night: estimate.factors.evening_night, weekend: estimate.factors.weekend };
    estimates.push({
      company_name: company.tow_companies?.name ?? "Bärgningsföretag",
      total_minor: estimate.total_minor,
      currency: estimate.currency,
      lines: estimate.lines.map((l) => ({ type: l.type, description: l.description, total_minor: l.total_minor })),
      cancellation_policy: priceList.cancellation_policy ?? null,
    });
  }
  estimates.sort((a, b) => a.total_minor - b.total_minor);

  return NextResponse.json({
    distance_km: distanceKm,
    factors,
    estimates,
    companies_without_pricing: withoutPricing,
    disclaimer:
      "Priserna är uppskattningar inklusive moms. Väntetid och extra arbete kan påverka slutpriset. Priset låses när en bärgare accepterar ditt uppdrag.",
  });
}

async function tryGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || process.env.GOOGLE_MAPS_GEOCODING_ENABLED === "false") return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", "se");
    url.searchParams.set("key", key);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const loc = json.results?.[0]?.geometry?.location;
    return typeof loc?.lat === "number" && typeof loc?.lng === "number" ? { lat: loc.lat, lng: loc.lng } : null;
  } catch {
    return null;
  }
}
