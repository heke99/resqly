import { NextResponse } from "next/server";
import { getBankidProvider } from "@resqly/bankid";
import { requireCustomer, jsonError } from "../../../../_lib";
import { bankidConfig, completeCustomerBankidSession, customerVisibleBankidText, signedPayloadForCustomerIncident } from "../_lib";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: incident } = await db.from("incidents" as never)
    .select("id, tenant_id, customer_user_id, case_number, type, vehicle_id, insurance_company_id, problem_type, damage_type, bankid_verified")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const inc = incident as { id: string; tenant_id: string; customer_user_id: string; case_number: string | null; type: string | null; vehicle_id: string | null; insurance_company_id: string | null; problem_type: string | null; damage_type: string | null; bankid_verified: boolean } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");
  if (inc.bankid_verified) return NextResponse.json({ status: "complete", bankid_verified: true });

  const config = bankidConfig();
  const provider = getBankidProvider(config);
  const payload = signedPayloadForCustomerIncident(inc);
  const started = await provider.sign({
    purpose: inc.type === "damage_claim" ? "Verifiera försäkringsärende" : "Verifiera bärgningsärende",
    personalNumber: typeof body.personal_number === "string" ? body.personal_number : undefined,
    endUserIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    userAgent: request.headers.get("user-agent") ?? undefined,
    userVisibleData: customerVisibleBankidText(inc),
    userVisibleDataFormat: "simpleMarkdownV1",
    userNonVisibleData: JSON.stringify(payload),
  });

  const { data: stored, error } = await db.from("bankid_sessions" as never).insert({
    tenant_id: inc.tenant_id,
    user_id: user.id,
    incident_id: inc.id,
    order_ref: started.orderRef,
    provider: started.provider ?? "bankid",
    tic_session_id: started.sessionId,
    auto_start_token: started.autoStartToken,
    qr_start_token: started.qrStartToken ?? null,
    qr_start_secret: started.qrStartSecret ?? null,
    subscription_token: started.subscriptionToken ?? null,
    session_expires_at: started.sessionExpiresAt ?? null,
    status: "pending",
    environment: config.env,
    purpose: inc.type === "damage_claim" ? "insurance_claim_verification" : "tow_case_verification",
    raw_status: { started, signed_payload: payload },
  } as never).select("id, tenant_id, user_id, incident_id, purpose, status, tic_session_id, order_ref, raw_status").single();
  if (error) return jsonError(400, error.message);

  // Local mock is allowed only outside production and completes in the same request.
  if (config.mockEnabled || config.env === "mock" || config.provider === "mock") {
    const result = await provider.collect(started.sessionId);
    const handled = await completeCustomerBankidSession({
      db,
      session: stored as { id: string; tenant_id: string | null; user_id: string | null; incident_id: string | null; purpose: string; status: string; tic_session_id?: string | null; order_ref: string; raw_status?: unknown },
      result,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    });
    return NextResponse.json({ ...handled, session_id: (stored as { id: string }).id });
  }

  return NextResponse.json({
    status: "pending",
    session_id: (stored as { id: string }).id,
    order_ref: started.orderRef,
    auto_start_token: started.autoStartToken,
    qr_start_token: started.qrStartToken ?? null,
    subscription_token: started.subscriptionToken ?? null,
    session_expires_at: started.sessionExpiresAt ?? null,
  }, { status: 202 });
}
