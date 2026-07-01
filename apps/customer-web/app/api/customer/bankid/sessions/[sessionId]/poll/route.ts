import { NextResponse } from "next/server";
import { getBankidProvider } from "@resqly/bankid";
import { requireCustomer, jsonError } from "../../../../_lib";
import { bankidConfig, completeCustomerBankidSession } from "../../../../cases/[id]/bankid/_lib";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireCustomer(request);
  if (auth instanceof NextResponse) return auth;
  const { db, user } = auth;
  const { sessionId } = await params;
  const { data: row } = await db.from("bankid_sessions" as never)
    .select("id, tenant_id, user_id, incident_id, purpose, status, tic_session_id, order_ref, raw_status")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  const session = row as { id: string; tenant_id: string | null; user_id: string | null; incident_id: string | null; purpose: string; status: string; tic_session_id?: string | null; order_ref: string; raw_status?: unknown } | null;
  if (!session) return jsonError(404, "BankID-sessionen hittades inte.");
  const provider = getBankidProvider(bankidConfig());
  const result = await provider.poll(session.tic_session_id ?? session.order_ref);
  const handled = await completeCustomerBankidSession({
    db,
    session,
    result,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  });
  return NextResponse.json(handled);
}
