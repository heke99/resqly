import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { buildSignatureRecord } from "@resqly/bankid";
import { requireCustomer, jsonError } from "../../../../_lib";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production" || process.env.BANKID_MOCK_ENABLED !== "true") {
    return jsonError(404, "BankID mock is disabled. Use /bankid/sign.");
  }
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, case_number, customer_user_id, status")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const inc = incident as { id: string; tenant_id: string; case_number: string | null; customer_user_id: string; status: string } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");

  const orderRef = `mock_${randomUUID()}`;
  const pepper = process.env.ENCRYPTION_KEY || "local-development-pepper-change-me";
  const signature = buildSignatureRecord({
    tenantId: inc.tenant_id,
    userId: user.id,
    incidentId: inc.id,
    orderRef,
    environment: "mock",
    pepper,
    signedPayload: { case_number: inc.case_number, purpose: "case_verification" },
    completion: {
      name: user.email ?? "Resqly Customer",
      personalNumber: "197001010000",
      signature: `mock_signature_${inc.id}`,
    },
    ip: request.headers.get("x-forwarded-for") ?? null,
    device: request.headers.get("user-agent") ?? null,
  });

  await db.from("bankid_sessions" as never).insert({
    tenant_id: inc.tenant_id,
    user_id: user.id,
    incident_id: inc.id,
    order_ref: orderRef,
    status: "complete",
    environment: "mock",
    purpose: "case_verification",
    completed_at: new Date().toISOString(),
  } as never);
  await db.from("bankid_signatures" as never).insert(signature as never);
  await db.from("user_identity_verifications" as never).upsert({
    tenant_id: inc.tenant_id,
    user_id: user.id,
    verified: true,
    display_name: user.email ?? "Resqly Customer",
    personal_number_hash: signature.personal_number_hash,
    environment: "mock",
    verified_at: new Date().toISOString(),
  } as never);

  await db
    .from("incidents" as never)
    .update({ status: "bankid_verified", bankid_verified: true } as never)
    .eq("id", inc.id)
    .eq("customer_user_id", user.id);
  await db.from("incident_status_events" as never).insert({
    incident_id: inc.id,
    from_status: inc.status,
    to_status: "bankid_verified",
    actor_user_id: user.id,
    reason: "BankID dev-verifiering slutförd",
  } as never);
  await db.from("audit_logs" as never).insert({
    tenant_id: inc.tenant_id,
    actor_user_id: user.id,
    action: "sign",
    entity_type: "bankid_signature",
    entity_id: inc.id,
    fields: ["order_ref", "signed_payload_hash"],
  } as never);

  return NextResponse.json({ status: "complete", order_ref: orderRef, bankid_verified: true });
}
