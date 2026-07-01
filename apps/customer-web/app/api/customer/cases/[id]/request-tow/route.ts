import { NextResponse } from "next/server";
import type { AppSupabaseClient } from "@resqly/database";
import { buildOfferPushMessage, sendExpoPush } from "@resqly/notifications";
import { requireCustomer, jsonError } from "../../../_lib";

const DEFAULT_SETTINGS = {
  default_dispatch_strategy: "eta_first",
  max_dispatch_radius_km: 50,
  max_dispatch_candidates: 8,
  max_insurance_broadcast_candidates: 250,
  offer_expiry_seconds: 120,
};

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickLocation(body: Record<string, unknown>, existing: { lat?: number | null; lng?: number | null } | null) {
  const pickup = body.pickup && typeof body.pickup === "object" ? body.pickup as { lat?: unknown; lng?: unknown } : null;
  const lat = Number(pickup?.lat ?? existing?.lat);
  const lng = Number(pickup?.lng ?? existing?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const priority = ["normal", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, type, status, requires_bankid, bankid_verified, customer_user_id, insurance_company_id, problem_type, case_number")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const inc = incident as {
    id: string;
    tenant_id: string;
    type: string;
    status: string;
    requires_bankid: boolean;
    bankid_verified: boolean;
    insurance_company_id: string | null;
    problem_type: string | null;
    case_number: string | null;
  } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");
  if (inc.requires_bankid && !inc.bankid_verified) {
    return jsonError(409, "BankID-verifiering krävs innan bärgning kan begäras.");
  }

  const { data: existing } = await db
    .from("tow_jobs" as never)
    .select("id, status")
    .eq("tenant_id", inc.tenant_id)
    .eq("incident_id", inc.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      tow_job_id: (existing as { id: string }).id,
      status: (existing as { status: string }).status,
    });
  }

  const { data: locRow } = await db
    .from("incident_locations" as never)
    .select("lat, lng, address")
    .eq("incident_id", inc.id)
    .eq("kind", "pickup")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const location = pickLocation(body, locRow as { lat?: number | null; lng?: number | null } | null);
  if (!location) return jsonError(400, "Upphämtningsplats krävs innan bärgning kan skickas ut.");

  const payerType = inc.insurance_company_id ? "insurance_company" : "customer_private";
  const { data: settingsRow } = await db
    .from("tenant_settings" as never)
    .select("default_dispatch_strategy, max_dispatch_radius_km, max_dispatch_candidates, max_insurance_broadcast_candidates, offer_expiry_seconds")
    .eq("tenant_id", inc.tenant_id)
    .maybeSingle();
  const settings = { ...DEFAULT_SETTINGS, ...((settingsRow as Record<string, unknown> | null) ?? {}) };
  const radiusKm = num(settings.max_dispatch_radius_km, DEFAULT_SETTINGS.max_dispatch_radius_km);
  const candidateLimit = payerType === "insurance_company"
    ? num(settings.max_insurance_broadcast_candidates, DEFAULT_SETTINGS.max_insurance_broadcast_candidates)
    : num(settings.max_dispatch_candidates, DEFAULT_SETTINGS.max_dispatch_candidates);

  const { data: job, error: jobError } = await db
    .from("tow_jobs" as never)
    .insert({
      tenant_id: inc.tenant_id,
      incident_id: inc.id,
      status: "matching",
      payer_type: payerType,
      priority,
    } as never)
    .select("id, status")
    .single();
  if (jobError) return jsonError(400, jobError.message);
  const jobId = (job as { id: string }).id;

  await db.from("tow_job_status_events" as never).insert({
    tow_job_id: jobId,
    from_status: null,
    to_status: "matching",
    actor_user_id: user.id,
    reason: payerType === "insurance_company"
      ? "kunden begärde bärgning; avtalade bärgare matchas"
      : "kunden begärde fri bärgning; marketplace matchas närmast först",
  } as never);

  const { data: candidates, error: candidateError } = await db.rpc("dispatch_eligible_candidates" as never, {
    p_lat: location.lat,
    p_lng: location.lng,
    p_radius_m: radiusKm * 1000,
    p_limit: candidateLimit,
    p_payer_type: payerType,
    p_insurance_tenant_id: payerType === "insurance_company" ? inc.tenant_id : null,
  } as never);
  if (candidateError) return jsonError(400, candidateError.message);
  const rows = ((candidates as Array<Record<string, unknown>> | null) ?? [])
    .filter((c) => typeof c.driver_id === "string" && typeof c.tow_company_id === "string")
    .sort((a, b) => {
      const agreementA = Number(a.agreement_priority ?? 100000);
      const agreementB = Number(b.agreement_priority ?? 100000);
      const distanceA = Number(a.distance_m ?? 0);
      const distanceB = Number(b.distance_m ?? 0);
      return payerType === "insurance_company"
        ? agreementA - agreementB || distanceA - distanceB
        : distanceA - distanceB;
    });
  const selected = payerType === "insurance_company" ? rows : rows.slice(0, candidateLimit);

  if (selected.length === 0) {
    await db.from("tow_jobs" as never).update({ status: "manual_review" } as never).eq("id", jobId);
    await db.from("tow_job_status_events" as never).insert({
      tow_job_id: jobId,
      from_status: "matching",
      to_status: "manual_review",
      actor_user_id: user.id,
      reason: payerType === "insurance_company"
        ? "ingen aktiv avtalad bärgare hittades inom radie"
        : "ingen aktiv marketplace-bärgare hittades inom radie",
    } as never);
    await db.from("audit_logs" as never).insert({
      tenant_id: inc.tenant_id,
      actor_user_id: user.id,
      action: "dispatch",
      entity_type: "tow_job",
      entity_id: jobId,
      fields: ["status", "priority"],
      metadata: { payer_type: payerType, contract_only: payerType === "insurance_company", offers: 0 },
    } as never);
    return NextResponse.json({ tow_job_id: jobId, status: "manual_review", offered_drivers: [] }, { status: 201 });
  }

  const expiresAt = new Date(Date.now() + num(settings.offer_expiry_seconds, DEFAULT_SETTINGS.offer_expiry_seconds) * 1000).toISOString();
  const offers = selected.map((c, index) => ({
    tenant_id: inc.tenant_id,
    tow_job_id: jobId,
    driver_id: c.driver_id,
    tow_company_id: c.tow_company_id,
    tow_vehicle_id: c.tow_vehicle_id ?? null,
    rank: index,
    distance_meters: c.distance_m ?? null,
    eta_seconds: null,
    expires_at: expiresAt,
  }));
  const { error: offerError } = await db.from("tow_job_offers" as never).insert(offers as never);
  if (offerError) return jsonError(400, offerError.message);

  await db.from("tow_jobs" as never).update({ status: "offered" } as never).eq("id", jobId);
  await db.from("tow_job_status_events" as never).insert({
    tow_job_id: jobId,
    from_status: "matching",
    to_status: "offered",
    actor_user_id: user.id,
    reason: payerType === "insurance_company"
      ? "erbjudande skickat till alla behöriga avtalade bärgningsbilar i radie"
      : "erbjudande skickat till närmaste marketplace-bärgare",
  } as never);
  await db.from("incidents" as never).update({ status: "submitted" } as never).eq("id", inc.id).eq("customer_user_id", user.id);

  await sendPushes(db, jobId, selected, location, inc.problem_type, expiresAt);

  await db.from("audit_logs" as never).insert({
    tenant_id: inc.tenant_id,
    actor_user_id: user.id,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: jobId,
    fields: ["status", "priority", "tow_company_id", "tow_vehicle_id"],
    metadata: {
      payer_type: payerType,
      contract_only: payerType === "insurance_company",
      offer_all_eligible: payerType === "insurance_company",
      offers: selected.length,
      case_number: inc.case_number,
    },
  } as never);

  return NextResponse.json({
    tow_job_id: jobId,
    status: "offered",
    offered_drivers: selected.map((c) => c.driver_id),
    offered_tow_vehicles: selected.map((c) => c.tow_vehicle_id).filter(Boolean),
    contract_only: payerType === "insurance_company",
  }, { status: 201 });
}

async function sendPushes(
  db: AppSupabaseClient,
  jobId: string,
  selected: Array<Record<string, unknown>>,
  location: { lat: number; lng: number },
  problemType: string | null,
  expiresAt: string,
) {
  if (process.env.EXPO_PUSH_ENABLED === "false") return;
  const approxArea = `${location.lat.toFixed(1)}, ${location.lng.toFixed(1)}`;
  for (const candidate of selected) {
    const driverId = stringOrNull(candidate.driver_id);
    if (!driverId) continue;
    const { data: devices } = await db
      .from("driver_devices" as never)
      .select("expo_push_token, platform")
      .eq("driver_id", driverId);
    const driverDevices = (devices as Array<{ expo_push_token: string; platform: string }> | null) ?? [];
    if (driverDevices.length === 0) {
      await db.from("tow_job_offers" as never)
        .update({ push_status: "skipped" } as never)
        .eq("tow_job_id", jobId)
        .eq("driver_id", driverId);
      continue;
    }
    const result = await sendExpoPush(driverDevices.map((device) => buildOfferPushMessage({
      expoPushToken: device.expo_push_token,
      offerId: `${jobId}:${driverId}`,
      towJobId: jobId,
      approxArea,
      problemType: problemType ?? "assistance",
      expiresAt,
    })));
    await db.from("tow_job_offers" as never)
      .update({ push_status: result.ok ? "sent" : "failed", push_error: result.error ?? null } as never)
      .eq("tow_job_id", jobId)
      .eq("driver_id", driverId);
  }
}
