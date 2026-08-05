import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../_lib";
import { recordConsent } from "../_consent";

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const body = await request.json().catch(() => ({}));
  const vehicleId = String(body.vehicle_id ?? "");
  const insuranceCompanyId = String(body.insurance_company_id ?? "");
  const policyNumber = body.policy_number ? String(body.policy_number) : null;
  if (!vehicleId || !insuranceCompanyId) return jsonError(400, "Fordon och försäkringsbolag krävs.");
  if (body.consent !== true) {
    return jsonError(400, "Du behöver godkänna kopplingen till försäkringsbolaget först.");
  }

  const { data: vehicle, error: vehicleError } = await db
    .from("vehicles" as never)
    .select("id, owner_user_id")
    .eq("id", vehicleId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (vehicleError) return jsonError(503, "Fordonet kunde inte kontrolleras just nu.");
  if (!vehicle) return jsonError(404, "Fordonet hittades inte.");

  const { data: insurer, error: insurerError } = await db
    .from("insurance_companies" as never)
    .select("id, tenant_id, name")
    .eq("id", insuranceCompanyId)
    .eq("active", true)
    .maybeSingle();
  if (insurerError) return jsonError(503, "Försäkringsbolaget kunde inte kontrolleras just nu.");
  const tenantId = (insurer as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return jsonError(404, "Försäkringsbolaget hittades inte.");

  const { data: existingPolicy, error: existingPolicyError } = await db
    .from("vehicle_insurance_policies" as never)
    .select("id, status")
    .eq("vehicle_id", vehicleId)
    .eq("customer_user_id", user.id)
    .eq("insurance_company_id", insuranceCompanyId)
    .in("status", ["pending_bankid", "insurance_pending", "insurance_verified", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingPolicyError) return jsonError(503, "Befintlig försäkringskoppling kunde inte kontrolleras.");
  if (existingPolicy) {
    const row = existingPolicy as { id: string; status: string };
    return NextResponse.json({
      policy_id: row.id,
      tenant_id: tenantId,
      status: row.status,
      requires_bankid: row.status === "pending_bankid",
      duplicate: true,
    });
  }

  const { data: policy, error } = await db
    .from("vehicle_insurance_policies" as never)
    .insert({
      vehicle_id: vehicleId,
      customer_user_id: user.id,
      insurance_company_id: insuranceCompanyId,
      tenant_id: tenantId,
      policy_number: policyNumber,
      is_active: false,
      status: "pending_bankid",
      created_by_user_id: user.id,
    } as never)
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const { data: concurrent, error: concurrentError } = await db
        .from("vehicle_insurance_policies" as never)
        .select("id, status")
        .eq("vehicle_id", vehicleId)
        .eq("customer_user_id", user.id)
        .eq("insurance_company_id", insuranceCompanyId)
        .in("status", ["pending_bankid", "insurance_pending", "insurance_verified", "active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (concurrentError) return jsonError(503, "Uppgifterna kunde inte kontrolleras just nu. Försök igen.");
      if (concurrent) {
        const row = concurrent as { id: string; status: string };
        return NextResponse.json({ policy_id: row.id, tenant_id: tenantId, status: row.status, requires_bankid: row.status === "pending_bankid", duplicate: true });
      }
    }
    return jsonError(400, "Försäkringskopplingen kunde inte sparas. Försök igen.");
  }

  const policyId = (policy as { id: string }).id;
  try {
    const { error: connectionError } = await db.from("customer_insurance_connections" as never).upsert({
      customer_user_id: user.id,
      tenant_id: tenantId,
      insurance_company_id: insuranceCompanyId,
      status: "pending_bankid",
    } as never, { onConflict: "customer_user_id,tenant_id,insurance_company_id" } as never);
    if (connectionError) throw new Error(connectionError.message);

    await recordConsent(db, {
      tenantId,
      userId: user.id,
      kind: "vehicle_insurance_link",
      vehicleId,
      vehiclePolicyId: policyId,
      request,
    });

    const { error: auditError } = await db.from("audit_logs" as never).insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      actor_kind: "user",
      action: "connect",
      entity_type: "vehicle_insurance_policy",
      entity_id: policyId,
      fields: ["vehicle_id", "insurance_company_id", "policy_number"],
    } as never);
    if (auditError) throw new Error(auditError.message);
  } catch {
    await db.from("customer_consent_acceptances" as never).delete().eq("vehicle_policy_id", policyId).eq("user_id", user.id);
    await db.from("audit_logs" as never).delete().eq("entity_id", policyId).eq("actor_user_id", user.id);
    await db.from("vehicle_insurance_policies" as never).delete().eq("id", policyId).eq("customer_user_id", user.id);
    return jsonError(503, "Försäkringskopplingen kunde inte sparas med full spårbarhet. Försök igen.");
  }

  return NextResponse.json({ policy_id: policyId, tenant_id: tenantId, status: "pending_bankid", requires_bankid: true });
}
