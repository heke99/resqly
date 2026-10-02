import type { AppSupabaseClient } from "@resqly/database";
import { buildSignatureRecord, redactBankidValue, type BankidCollectResult } from "@resqly/bankid";
import { NextResponse } from "next/server";

export function bankidErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const restart =
    /version_conflict|binding_mismatch|unbound_session|not_completable|Starta en ny/.test(message);
  return NextResponse.json(
    {
      error: restart
        ? "Underlaget eller BankID-sessionen har ändrats. Öppna ärendet och starta en ny verifiering."
        : "BankID-verifieringen kunde inte slutföras just nu. Försök igen.",
    },
    { status: restart ? 409 : 503 },
  );
}

export function bankidConfig() {
  const env = (process.env.BANKID_ENV ??
    (process.env.NODE_ENV === "production" ? "production" : "mock")) as
    "mock" | "test" | "production";
  const provider = (process.env.BANKID_PROVIDER ?? (env === "production" ? "tic" : "mock")) as
    "mock" | "tic";
  const mockEnabled = process.env.BANKID_MOCK_ENABLED === "true" || env === "mock";
  // Hard production guard: mock/test BankID can never run in production.
  const isProduction = (process.env.APP_ENV ?? process.env.NODE_ENV) === "production";
  if (isProduction && (mockEnabled || env !== "production" || provider !== "tic")) {
    throw new Error("Mock/test BankID configuration is not allowed in production");
  }
  return {
    env,
    provider,
    mockEnabled,
    tic: {
      apiBaseUrl: process.env.TIC_API_BASE_URL ?? "https://id.tic.io/api/v1",
      apiKey: process.env.TIC_API_KEY ?? "",
      defaultProvider: "bankid" as const,
    },
  };
}

/** Pepper for hashing personal numbers. Weak dev fallback is blocked in production. */
export function bankidPepper(): string {
  const pepper = process.env.ENCRYPTION_KEY;
  if (pepper) return pepper;
  if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
    throw new Error("ENCRYPTION_KEY is required in production");
  }
  return "dev-only-change-me";
}

export function customerVisibleBankidText(incident: {
  case_number?: string | null;
  type?: string | null;
  problem_type?: string | null;
  damage_type?: string | null;
}): string {
  const kind =
    incident.type === "damage_claim" ? "försäkringsärende" : "bärgnings-/assistansärende";
  return [
    `Jag bekräftar mitt ${kind}.`,
    `Ärendenummer: ${incident.case_number ?? "saknas"}.`,
    incident.problem_type ? `Problem: ${incident.problem_type}.` : null,
    incident.damage_type ? `Skadetyp: ${incident.damage_type}.` : null,
    "Jag godkänner att uppgifter delas med mitt försäkringsbolag och avtalad bärgare för handläggning av ärendet.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function completeCustomerBankidSession(input: {
  db: AppSupabaseClient;
  session: {
    id: string;
    tenant_id: string | null;
    user_id: string | null;
    incident_id: string | null;
    purpose: string;
    status: string;
    tic_session_id?: string | null;
    order_ref: string;
    raw_status?: unknown;
    bound_payload_text?: string | null;
    environment?: string;
  };
  result: BankidCollectResult;
  ip?: string | null;
  fromWebhook?: boolean;
}) {
  const { db, session, result, ip } = input;
  const previousRaw =
    session.raw_status && typeof session.raw_status === "object"
      ? (session.raw_status as Record<string, unknown>)
      : {};

  if (result.status !== "complete" || !result.completionData) {
    const { data: updated, error } = await db
      .from("bankid_sessions" as never)
      .update({
        status: result.status,
        hint_code: result.hintCode ?? null,
        raw_status: { ...previousRaw, provider_result: redactBankidValue(result.raw ?? result) },
      } as never)
      .eq("id", session.id)
      .select("status,hint_code")
      .single();
    if (error) throw new Error(error.message);
    const current = updated as { status: string; hint_code: string | null };
    const { data: incident } =
      session.incident_id && current.status === "complete"
        ? await db
            .from("incidents")
            .select("bankid_verified")
            .eq("id", session.incident_id)
            .eq("customer_user_id", session.user_id ?? "")
            .maybeSingle()
        : { data: null };
    return {
      status: current.status,
      bankid_verified: Boolean(incident?.bankid_verified),
      hint_code: current.hint_code,
    };
  }

  if (!session.tenant_id || !session.user_id)
    throw new Error("BankID session saknar kundkoppling.");
  if (!session.bound_payload_text) throw new Error("Starta en ny BankID-session för detta ärende.");
  const payload = JSON.parse(session.bound_payload_text) as Record<string, unknown>;
  const incidentId = session.incident_id;
  const signature = buildSignatureRecord({
    tenantId: session.tenant_id,
    userId: session.user_id,
    incidentId,
    orderRef: result.orderRef,
    environment: session.environment as "mock" | "test" | "production",
    pepper: bankidPepper(),
    signedPayload: session.bound_payload_text,
    completion: result.completionData,
    ip: ip ?? null,
  });

  const { data, error } = await db.rpc(
    "complete_bankid_session" as never,
    {
      p_session_id: session.id,
      p_signature: {
        ...signature,
        tic_session_id: session.tic_session_id ?? result.sessionId,
      },
      p_business_payload: payload,
      p_result: {
        status: result.status,
        hintCode: result.hintCode ?? null,
        completedAt: result.completedAt ?? new Date().toISOString(),
        sessionId: result.sessionId,
        orderRef: result.orderRef,
        raw: redactBankidValue(result.raw ?? result),
      },
      p_from_webhook: input.fromWebhook ?? false,
    } as never,
  );
  if (error) throw new Error(error.message);

  const row = (Array.isArray(data) ? data[0] : data) as {
    newly_processed?: boolean;
    flow?: "incident" | "vehicle_policy";
  } | null;
  return {
    status: "complete",
    bankid_verified: true,
    vehicle_policy_verified: row?.flow === "vehicle_policy",
    replay: !row?.newly_processed,
  };
}
