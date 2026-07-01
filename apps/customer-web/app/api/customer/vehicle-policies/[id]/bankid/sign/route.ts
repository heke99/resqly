import { NextResponse } from "next/server";
import { getBankidProvider } from "@resqly/bankid";
import { requireCustomer, jsonError } from "../../../../_lib";
import { bankidConfig, completeCustomerBankidSession } from "../../../../cases/[id]/bankid/_lib";

function vehiclePolicyVisibleText(input: { registration_number?: string | null; insurer_name?: string | null; policy_number?: string | null }) {
  return [
    "Jag bekräftar att detta fordon ska kopplas till valt försäkringsbolag.",
    input.registration_number ? `Registreringsnummer: ${input.registration_number}.` : null,
    input.insurer_name ? `Försäkringsbolag: ${input.insurer_name}.` : null,
    input.policy_number ? `Försäkrings-/kundnummer: ${input.policy_number}.` : null,
    "Jag godkänner att uppgifter delas med försäkringsbolaget för verifiering och handläggning.",
  ].filter(Boolean).join("\n");
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const { data: row } = await db.from("vehicle_insurance_policies" as never)
    .select("id, tenant_id, customer_user_id, vehicle_id, insurance_company_id, policy_number, is_active, status, vehicles(registration_number), insurance_companies(name)")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const policy = row as {
    id: string;
    tenant_id: string;
    customer_user_id: string;
    vehicle_id: string;
    insurance_company_id: string;
    policy_number: string | null;
    is_active: boolean;
    status?: string | null;
    vehicles?: { registration_number?: string | null } | null;
    insurance_companies?: { name?: string | null } | null;
  } | null;
  if (!policy) return jsonError(404, "Försäkringskopplingen hittades inte.");
  if (policy.is_active && policy.status === "active") return NextResponse.json({ status: "complete", bankid_verified: true, vehicle_policy_verified: true });

  const config = bankidConfig();
  const provider = getBankidProvider(config);
  const signedPayload = {
    vehicle_policy_id: policy.id,
    vehicle_id: policy.vehicle_id,
    insurance_company_id: policy.insurance_company_id,
    policy_number: policy.policy_number,
  };
  const started = await provider.sign({
    purpose: "Verifiera fordonskoppling",
    personalNumber: typeof body.personal_number === "string" ? body.personal_number : undefined,
    endUserIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1",
    userAgent: request.headers.get("user-agent") ?? undefined,
    userVisibleData: vehiclePolicyVisibleText({
      registration_number: policy.vehicles?.registration_number,
      insurer_name: policy.insurance_companies?.name,
      policy_number: policy.policy_number,
    }),
    userVisibleDataFormat: "simpleMarkdownV1",
    userNonVisibleData: JSON.stringify(signedPayload),
  });

  const { data: stored, error } = await db.from("bankid_sessions" as never).insert({
    tenant_id: policy.tenant_id,
    user_id: user.id,
    incident_id: null,
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
    purpose: "vehicle_insurance_connection",
    raw_status: { started, signed_payload: signedPayload },
  } as never).select("id, tenant_id, user_id, incident_id, purpose, status, tic_session_id, order_ref, raw_status").single();
  if (error) return jsonError(400, error.message);

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
