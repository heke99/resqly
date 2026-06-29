import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../_lib";

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
  const coords = body.coords && typeof body.coords === "object" ? body.coords as { lat?: number; lng?: number } : null;
  if (!vehicleId) return jsonError(400, "vehicle_id is required.");
  if (!["towing", "roadside_assistance", "damage_claim"].includes(type)) return jsonError(400, "Invalid case type.");

  // "private" = direct/marketplace towing without an insurance policy.
  const mode = String(body.mode ?? "") === "private" ? "private" : "insurance";

  const { data: vehicle } = await db
    .from("vehicles" as never)
    .select("id, owner_user_id, registration_number")
    .eq("id", vehicleId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vehicle) return jsonError(404, "Vehicle not found.");

  let tenantId: string | null = null;
  let insuranceCompanyId: string | null = null;
  let requiresBankid = false;

  if (mode === "private") {
    if (type === "damage_claim") {
      return jsonError(400, "Damage claims require an insurance connection.");
    }
    // Direct/private towing is handled by the marketplace operator tenant.
    const { data: marketplaceTenant } = await db
      .from("tenants" as never)
      .select("id")
      .eq("type", "platform_internal")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    tenantId = (marketplaceTenant as { id?: string } | null)?.id ?? null;
    if (!tenantId) {
      return jsonError(409, "Direct/private towing is not enabled on this platform yet.");
    }
    const { data: settings } = await db
      .from("tenant_settings" as never)
      .select("bankid_required_for_tow")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    requiresBankid = (settings as { bankid_required_for_tow?: boolean } | null)?.bankid_required_for_tow === true;
  } else {
    const { data: policy } = await db
      .from("vehicle_insurance_policies" as never)
      .select("id, insurance_company_id, tenant_id, policy_number")
      .eq("vehicle_id", vehicleId)
      .eq("customer_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    const activePolicy = policy as { id: string; insurance_company_id: string; tenant_id: string | null } | null;
    if (!activePolicy?.insurance_company_id)
      return jsonError(409, "Connect this vehicle to an insurance company first, or choose direct/private towing.");
    insuranceCompanyId = activePolicy.insurance_company_id;

    tenantId = activePolicy.tenant_id;
    if (!tenantId) {
      const { data: insurer } = await db
        .from("insurance_companies" as never)
        .select("tenant_id")
        .eq("id", activePolicy.insurance_company_id)
        .maybeSingle();
      tenantId = (insurer as { tenant_id?: string } | null)?.tenant_id ?? null;
    }
    if (!tenantId) return jsonError(409, "Insurance tenant is missing for this policy.");

    const { data: settings } = await db
      .from("tenant_settings" as never)
      .select("bankid_required_for_claims, bankid_required_for_tow")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const s = (settings as { bankid_required_for_claims?: boolean; bankid_required_for_tow?: boolean } | null) ?? {};
    requiresBankid = type === "damage_claim" ? s.bankid_required_for_claims !== false : s.bankid_required_for_tow !== false;
  }

  const { data: caseNo, error: rpcErr } = await db.rpc("allocate_case_number" as never, {
    p_tenant: tenantId,
    p_scope: "default",
  } as never);
  if (rpcErr) return jsonError(400, rpcErr.message);

  const initialStatus = requiresBankid ? "awaiting_bankid" : "submitted";
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
      description,
      requires_bankid: requiresBankid,
      bankid_verified: false,
      case_number: caseNo as unknown as string,
    } as never)
    .select("id")
    .single();
  if (error) return jsonError(400, error.message);
  const incidentId = (incident as { id: string }).id;

  await db.from("incident_status_events" as never).insert({
    incident_id: incidentId,
    from_status: null,
    to_status: initialStatus,
    actor_user_id: user.id,
    reason: "created from customer app",
  } as never);

  if (coords?.lat && coords?.lng) {
    await db.from("incident_locations" as never).insert({
      incident_id: incidentId,
      kind: "pickup",
      lat: coords.lat,
      lng: coords.lng,
    } as never);
  }

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "incident",
    entity_id: incidentId,
    fields: ["vehicle_id", "insurance_company_id", "case_number", "status"],
    metadata: { mode },
  } as never);

  return NextResponse.json(
    { incident_id: incidentId, case_number: caseNo, status: initialStatus, requires_bankid: requiresBankid, mode },
    { status: 201 },
  );
}
