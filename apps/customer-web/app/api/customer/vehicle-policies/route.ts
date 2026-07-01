import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../_lib";

export async function POST(request: Request) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const body = await request.json().catch(() => ({}));
  const vehicleId = String(body.vehicle_id ?? "");
  const insuranceCompanyId = String(body.insurance_company_id ?? "");
  const policyNumber = body.policy_number ? String(body.policy_number) : null;
  if (!vehicleId || !insuranceCompanyId) return jsonError(400, "Fordon och försäkringsbolag krävs.");

  const { data: vehicle } = await db
    .from("vehicles" as never)
    .select("id, owner_user_id")
    .eq("id", vehicleId)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (!vehicle) return jsonError(404, "Fordonet hittades inte.");

  const { data: insurer } = await db
    .from("insurance_companies" as never)
    .select("id, tenant_id, name")
    .eq("id", insuranceCompanyId)
    .eq("active", true)
    .maybeSingle();
  const tenantId = (insurer as { tenant_id?: string } | null)?.tenant_id;
  if (!tenantId) return jsonError(404, "Försäkringsbolaget hittades inte.");

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
    } as never)
    .select("id")
    .single();
  if (error) return jsonError(400, error.message);

  await db.from("customer_insurance_connections" as never).upsert({
    customer_user_id: user.id,
    tenant_id: tenantId,
    insurance_company_id: insuranceCompanyId,
    status: "pending_bankid",
  } as never, { onConflict: "customer_user_id,tenant_id,insurance_company_id" } as never);

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: "connect",
    entity_type: "vehicle_insurance_policy",
    entity_id: (policy as { id: string }).id,
    fields: ["vehicle_id", "insurance_company_id", "policy_number"],
  } as never);

  return NextResponse.json({ policy_id: (policy as { id: string }).id, tenant_id: tenantId, status: "pending_bankid", requires_bankid: true });
}
