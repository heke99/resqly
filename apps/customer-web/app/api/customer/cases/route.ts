import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../_lib";
import { randomUUID } from "node:crypto";
import { createIncidentWorkflow, WorkflowError } from "@resqly/database";
import { prepareConsent, type ConsentKind } from "../_consent";

const TOWING_TYPES = new Set(["towing", "roadside_assistance"]);

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;

  const body = await request.json().catch(() => ({}));
  const vehicleId = String(body.vehicle_id ?? "");
  const type = String(body.type ?? "towing");
  const subtype = String(body.subtype ?? "");
  const description = body.description ? String(body.description) : null;
  const coords =
    body.coords && typeof body.coords === "object"
      ? (body.coords as { lat?: number; lng?: number })
      : null;
  const manualAddress =
    typeof body.address === "string" && body.address.trim()
      ? body.address.trim().slice(0, 300)
      : null;
  const destinationAddress =
    typeof body.destination === "string" && body.destination.trim()
      ? body.destination.trim().slice(0, 300)
      : null;
  if (!vehicleId) return jsonError(400, "Välj vilket fordon ärendet gäller.");
  if (!["towing", "roadside_assistance", "damage_claim"].includes(type))
    return jsonError(400, "Ogiltig ärendetyp.");

  // "private" = direct/marketplace towing without an insurance policy.
  const mode = String(body.mode ?? "") === "private" ? "private" : "insurance";

  // Explicit data-sharing consent is required before a case is created.
  if (body.consent !== true) {
    return jsonError(400, "Du behöver godkänna hur dina uppgifter delas innan ärendet kan skapas.");
  }

  const { data: vehicle, error: vehicleError } = await db
    .from("vehicles" as never)
    .select("id, owner_user_id, registration_number")
    .eq("id", vehicleId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (vehicleError) return jsonError(503, "Fordonet kunde inte kontrolleras just nu.");
  if (!vehicle) return jsonError(404, "Fordonet hittades inte.");

  let tenantId: string | null = null;
  let insuranceCompanyId: string | null = null;

  if (mode === "private") {
    if (type === "damage_claim") {
      return jsonError(400, "Skadeärenden kräver koppling till försäkringsbolag.");
    }
    // Direct/private towing is handled by the marketplace operator tenant.
    const { data: marketplaceTenant, error: marketplaceError } = await db
      .from("tenants" as never)
      .select("id")
      .eq("type", "platform_internal")
      .eq("status", "active")
      .eq("private_marketplace_operator", true)
      .maybeSingle();
    if (marketplaceError) return jsonError(503, "Privat bärgning kunde inte kontrolleras just nu.");
    tenantId = (marketplaceTenant as { id?: string } | null)?.id ?? null;
    if (!tenantId) {
      return jsonError(409, "Privat bärgning är inte aktiverad ännu.");
    }
  } else {
    const { data: policy, error: policyError } = await db
      .from("vehicle_insurance_policies" as never)
      .select("id, insurance_company_id, tenant_id, policy_number")
      .eq("vehicle_id", vehicleId)
      .eq("customer_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) return jsonError(503, "Försäkringskopplingen kunde inte läsas just nu.");
    const activePolicy = policy as {
      id: string;
      insurance_company_id: string;
      tenant_id: string | null;
    } | null;
    if (!activePolicy?.insurance_company_id)
      return jsonError(
        409,
        "Koppla fordonet till ett försäkringsbolag först, eller välj privat bärgning.",
      );
    insuranceCompanyId = activePolicy.insurance_company_id;

    tenantId = activePolicy.tenant_id;
    if (!tenantId) {
      const { data: insurer, error: insurerError } = await db
        .from("insurance_companies" as never)
        .select("tenant_id")
        .eq("id", activePolicy.insurance_company_id)
        .maybeSingle();
      if (insurerError) return jsonError(503, "Försäkringsbolagets organisation kunde inte läsas.");
      tenantId = (insurer as { tenant_id?: string } | null)?.tenant_id ?? null;
    }
    if (!tenantId) return jsonError(409, "Försäkringsbolaget saknar aktiv organisationskoppling.");
  }

  const hasCoordinates = typeof coords?.lat === "number" && typeof coords?.lng === "number";
  const pickup = hasCoordinates ? coords : manualAddress ? await tryGeocode(manualAddress) : null;
  const locations: Array<Record<string, unknown>> = [];
  if (pickup || manualAddress)
    locations.push({
      kind: "pickup",
      lat: pickup?.lat ?? null,
      lng: pickup?.lng ?? null,
      address: manualAddress,
      manually_adjusted: !hasCoordinates,
    });
  if (destinationAddress && TOWING_TYPES.has(type)) {
    const destination = await tryGeocode(destinationAddress);
    locations.push({
      kind: "destination",
      lat: destination?.lat ?? null,
      lng: destination?.lng ?? null,
      address: destinationAddress,
    });
  }
  const consentKinds: ConsentKind[] =
    mode === "private"
      ? ["share_with_tow_partner"]
      : type === "damage_claim"
        ? ["claim_submission", "share_with_insurer"]
        : ["share_with_insurer", "share_with_tow_partner"];
  try {
    const consents = await Promise.all(
      consentKinds.map((kind) => prepareConsent(db, tenantId, kind, { case_type: type, mode })),
    );
    const key =
      request.headers.get("idempotency-key") ??
      request.headers.get("x-idempotency-key") ??
      randomUUID();
    const result = await createIncidentWorkflow(
      db,
      { tenantId, userId: user.id, key, correlationId: randomUUID() },
      {
        customer_user_id: user.id,
        vehicle_id: vehicleId,
        insurance_company_id: insuranceCompanyId,
        type,
        damage_type: type === "damage_claim" ? subtype || null : null,
        problem_type: TOWING_TYPES.has(type) ? subtype || null : null,
        description,
        pickup: hasCoordinates ? coords : null,
        pickup_address: manualAddress,
        destination_address: destinationAddress,
        consent: true,
      },
      locations,
      consents,
    );
    return NextResponse.json(result, {
      status: result.replay ? 200 : 201,
      headers: {
        "idempotency-key": key,
        ...(result.replay ? { "x-idempotent-replay": "true" } : {}),
      },
    });
  } catch (error) {
    const status = error instanceof WorkflowError ? error.status : 503;
    return jsonError(
      status,
      status === 409
        ? "Samma förfrågan har redan skickats med andra uppgifter. Kontrollera ärendet."
        : status === 403
          ? "Fordonet eller försäkringskopplingen är inte tillgänglig för dig."
          : "Ärendet kunde inte sparas. Kontrollera uppgifterna och försök igen.",
    );
  }
}

async function tryGeocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || process.env.GOOGLE_MAPS_GEOCODING_ENABLED === "false") return null;
  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("region", "se");
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    const loc = json.results?.[0]?.geometry?.location;
    return typeof loc?.lat === "number" && typeof loc?.lng === "number"
      ? { lat: loc.lat, lng: loc.lng }
      : null;
  } catch {
    return null;
  }
}
