import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../../../_lib";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const priority = String(body.priority ?? "normal");

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, type, status, requires_bankid, bankid_verified, customer_user_id, insurance_company_id")
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
  } | null;
  if (!inc) return jsonError(404, "Case not found.");
  if (inc.requires_bankid && !inc.bankid_verified) return jsonError(409, "BankID must be completed before requesting tow.");

  // Insurance vs direct/private determines which dispatch eligibility path runs.
  const payerType = inc.insurance_company_id ? "insurance_company" : "customer_private";

  const { data: existing } = await db
    .from("tow_jobs" as never)
    .select("id, status")
    .eq("tenant_id", inc.tenant_id)
    .eq("incident_id", inc.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ tow_job_id: (existing as { id: string }).id, status: (existing as { status: string }).status });

  const { data: job, error } = await db
    .from("tow_jobs" as never)
    .insert({
      tenant_id: inc.tenant_id,
      incident_id: inc.id,
      status: "manual_review",
      payer_type: payerType,
      priority,
    } as never)
    .select("id, status")
    .single();
  if (error) return jsonError(400, error.message);

  await db.from("tow_job_status_events" as never).insert({
    tow_job_id: (job as { id: string }).id,
    from_status: null,
    to_status: "manual_review",
    actor_user_id: user.id,
    reason: "customer requested tow; waiting for dispatcher/dispatch engine",
  } as never);
  await db.from("incidents" as never).update({ status: "submitted" } as never).eq("id", inc.id).eq("customer_user_id", user.id);
  await db.from("audit_logs" as never).insert({
    tenant_id: inc.tenant_id,
    actor_user_id: user.id,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: (job as { id: string }).id,
    fields: ["status", "priority"],
    metadata: { mode: "manual_review_until_dispatch_candidates_exist" },
  } as never);

  return NextResponse.json({ tow_job_id: (job as { id: string }).id, status: "manual_review" }, { status: 201 });
}
