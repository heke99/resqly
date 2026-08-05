import { NextResponse } from "next/server";
import { requireCustomer, jsonError, replayIfIdempotent, storeIdempotentResponse } from "../_lib";
import { recordConsent, type ConsentKind } from "../_consent";
import { sendCustomerEmail, escapeHtml } from "../_email";

const TOWING_TYPES = new Set(["towing", "roadside_assistance"]);

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;

  // Replay protection: double clicks / mobile retries never create two cases.
  const { key: idemKey, replay } = await replayIfIdempotent(db, user.id, "case.create", request);
  if (replay) return replay;

  const body = await request.json().catch(() => ({}));
  const vehicleId = String(body.vehicle_id ?? "");
  const type = String(body.type ?? "towing");
  const subtype = String(body.subtype ?? "");
  const description = body.description ? String(body.description) : null;
  const coords = body.coords && typeof body.coords === "object" ? body.coords as { lat?: number; lng?: number } : null;
  const manualAddress = typeof body.address === "string" && body.address.trim() ? body.address.trim().slice(0, 300) : null;
  const destinationAddress =
    typeof body.destination === "string" && body.destination.trim() ? body.destination.trim().slice(0, 300) : null;
  if (!vehicleId) return jsonError(400, "Välj vilket fordon ärendet gäller.");
  if (!["towing", "roadside_assistance", "damage_claim"].includes(type)) return jsonError(400, "Ogiltig ärendetyp.");

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
  let requiresBankid = false;

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
    const { data: settings, error: settingsError } = await db
      .from("tenant_settings" as never)
      .select("bankid_required_for_tow")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (settingsError) return jsonError(503, "Organisationens regler kunde inte läsas just nu.");
    requiresBankid = (settings as { bankid_required_for_tow?: boolean } | null)?.bankid_required_for_tow === true;
  } else {
    const { data: policy, error: policyError } = await db
      .from("vehicle_insurance_policies" as never)
      .select("id, insurance_company_id, tenant_id, policy_number")
      .eq("vehicle_id", vehicleId)
      .eq("customer_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) return jsonError(503, "Försäkringskopplingen kunde inte läsas just nu.");
    const activePolicy = policy as { id: string; insurance_company_id: string; tenant_id: string | null } | null;
    if (!activePolicy?.insurance_company_id)
      return jsonError(409, "Koppla fordonet till ett försäkringsbolag först, eller välj privat bärgning.");
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

    const { data: settings, error: settingsError } = await db
      .from("tenant_settings" as never)
      .select("bankid_required_for_claims, bankid_required_for_tow")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (settingsError) return jsonError(503, "Försäkringsbolagets regler kunde inte läsas just nu.");
    const s = (settings as { bankid_required_for_claims?: boolean; bankid_required_for_tow?: boolean } | null) ?? {};
    requiresBankid = type === "damage_claim" ? s.bankid_required_for_claims !== false : s.bankid_required_for_tow !== false;
  }

  const { data: caseNo, error: rpcErr } = await db.rpc("allocate_case_number" as never, {
    p_tenant: tenantId,
    p_scope: "default",
  } as never);
  if (rpcErr) return jsonError(503, "Ärendet kunde inte skapas just nu. Försök igen om en stund.");

  const initialStatus = requiresBankid ? "awaiting_bankid" : "submitted";
  const hasCoordinates = typeof coords?.lat === "number" && typeof coords?.lng === "number";
  const combinedDescription = manualAddress && !hasCoordinates
    ? [description, `Upphämtningsadress (angiven av kund): ${manualAddress}`].filter(Boolean).join("\n")
    : description;
  const { data: incident, error } = await db
    .from("incidents" as never)
    .insert({
      tenant_id: tenantId,
      customer_user_id: user.id,
      vehicle_id: vehicleId,
      insurance_company_id: insuranceCompanyId,
      type,
      status: initialStatus,
      damage_type: type === "damage_claim" ? subtype : null,
      problem_type: TOWING_TYPES.has(type) ? subtype : null,
      description: combinedDescription,
      requires_bankid: requiresBankid,
      bankid_verified: false,
      case_number: caseNo as unknown as string,
      created_by_user_id: user.id,
    } as never)
    .select("id")
    .single();
  if (error) return jsonError(400, "Ärendet kunde inte skapas. Försök igen.");
  const incidentId = (incident as { id: string }).id;

  try {
    const { error: statusEventError } = await db.from("incident_status_events" as never).insert({
      incident_id: incidentId,
      from_status: null,
      to_status: initialStatus,
      actor_user_id: user.id,
      actor_kind: "user",
      reason: "Skapat av kund",
    } as never);
    if (statusEventError) throw new Error(statusEventError.message);

    // Versioned consent trail: what data sharing the customer accepted, with
    // text hash + version. BankID (when required) is the verification on top.
    const consentKinds: ConsentKind[] =
      mode === "private"
        ? ["share_with_tow_partner"]
        : type === "damage_claim"
          ? ["claim_submission", "share_with_insurer"]
          : ["share_with_insurer", "share_with_tow_partner"];
    for (const kind of consentKinds) {
      await recordConsent(db, {
        tenantId,
        userId: user.id,
        kind,
        incidentId,
        vehicleId,
        request,
        metadata: { case_type: type, mode },
      });
    }

    if (hasCoordinates) {
      const { error: locationError } = await db.from("incident_locations" as never).insert({
        incident_id: incidentId,
        kind: "pickup",
        lat: coords.lat,
        lng: coords.lng,
        address: manualAddress,
      } as never);
      if (locationError) throw new Error(locationError.message);
    } else if (manualAddress) {
      const geocoded = await tryGeocode(manualAddress);
      if (geocoded) {
        const { error: locationError } = await db.from("incident_locations" as never).insert({
          incident_id: incidentId,
          kind: "pickup",
          lat: geocoded.lat,
          lng: geocoded.lng,
          address: manualAddress,
          manually_adjusted: true,
        } as never);
        if (locationError) throw new Error(locationError.message);
      }
    }

    if (destinationAddress && TOWING_TYPES.has(type)) {
      const geocodedDest = await tryGeocode(destinationAddress);
      const { error: destinationError } = await db.from("incident_locations" as never).insert({
        incident_id: incidentId,
        kind: "destination",
        lat: geocodedDest?.lat ?? null,
        lng: geocodedDest?.lng ?? null,
        address: destinationAddress,
      } as never);
      if (destinationError) throw new Error(destinationError.message);
    }

    const { error: auditError } = await db.from("audit_logs" as never).insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_kind: "user",
      action: "create",
      entity_type: "incident",
      entity_id: incidentId,
      fields: ["vehicle_id", "insurance_company_id", "case_number", "status"],
      metadata: { mode },
    } as never);
    if (auditError) throw new Error(auditError.message);
  } catch {
    await db.from("customer_consent_acceptances" as never).delete().eq("incident_id", incidentId).eq("user_id", user.id);
    await db.from("audit_logs" as never).delete().eq("entity_id", incidentId).eq("actor_user_id", user.id);
    await db.from("incidents" as never).delete().eq("id", incidentId).eq("customer_user_id", user.id);
    return jsonError(503, "Ärendet kunde inte sparas med full spårbarhet. Försök igen.");
  }

  await sendCustomerEmail(db, {
    tenantId,
    to: user.email,
    subject: `Vi har tagit emot ditt ärende ${caseNo}`,
    html: requiresBankid
      ? `<p>Ditt ärende <strong>${escapeHtml(String(caseNo))}</strong> är skapat.</p><p>Nästa steg: verifiera ärendet med BankID i appen så att det kan skickas vidare.</p>`
      : `<p>Ditt ärende <strong>${escapeHtml(String(caseNo))}</strong> är skapat.</p><p>Du kan följa status i appen.</p>`,
    incidentId,
    dedupeKey: `email:case_created:${incidentId}`,
  });

  const responseBody = { incident_id: incidentId, case_number: caseNo, status: initialStatus, requires_bankid: requiresBankid, mode };
  await storeIdempotentResponse(db, user.id, "case.create", idemKey, incidentId, responseBody);
  return NextResponse.json(responseBody, { status: 201 });
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
