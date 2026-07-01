import type { AppSupabaseClient } from "@resqly/database";
import { buildSignatureRecord, getBankidProvider, type BankidCollectResult } from "@resqly/bankid";

export function bankidConfig() {
  const env = (process.env.BANKID_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "mock")) as "mock" | "test" | "production";
  const provider = (process.env.BANKID_PROVIDER ?? (env === "production" ? "tic" : "mock")) as "mock" | "tic";
  const mockEnabled = process.env.BANKID_MOCK_ENABLED === "true" || env === "mock";
  if (process.env.NODE_ENV === "production" && mockEnabled) {
    throw new Error("BANKID_MOCK_ENABLED must be false in production");
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

export function customerVisibleBankidText(incident: { case_number?: string | null; type?: string | null; problem_type?: string | null; damage_type?: string | null }): string {
  const kind = incident.type === "damage_claim" ? "försäkringsärende" : "bärgnings-/assistansärende";
  return [
    `Jag bekräftar mitt ${kind}.`,
    `Ärendenummer: ${incident.case_number ?? "saknas"}.`,
    incident.problem_type ? `Problem: ${incident.problem_type}.` : null,
    incident.damage_type ? `Skadetyp: ${incident.damage_type}.` : null,
    "Jag godkänner att uppgifter delas med mitt försäkringsbolag och avtalad bärgare för handläggning av ärendet.",
  ].filter(Boolean).join("\n");
}

export function signedPayloadForCustomerIncident(incident: { id: string; case_number?: string | null; type?: string | null; vehicle_id?: string | null; insurance_company_id?: string | null; problem_type?: string | null; damage_type?: string | null }) {
  return {
    incident_id: incident.id,
    case_number: incident.case_number ?? null,
    type: incident.type ?? null,
    vehicle_id: incident.vehicle_id ?? null,
    insurance_company_id: incident.insurance_company_id ?? null,
    problem_type: incident.problem_type ?? null,
    damage_type: incident.damage_type ?? null,
  };
}

export async function completeCustomerBankidSession(input: {
  db: AppSupabaseClient;
  session: { id: string; tenant_id: string | null; user_id: string | null; incident_id: string | null; purpose: string; status: string; tic_session_id?: string | null; order_ref: string; raw_status?: unknown };
  result: BankidCollectResult;
  ip?: string | null;
}) {
  const { db, session, result, ip } = input;
  await db.from("bankid_sessions" as never).update({
    status: result.status,
    hint_code: result.hintCode ?? null,
    completed_at: result.status === "complete" ? result.completedAt ?? new Date().toISOString() : null,
    raw_status: result.raw ?? result,
  } as never).eq("id", session.id);

  if (result.status !== "complete" || !result.completionData || session.status === "complete") {
    return { status: result.status, bankid_verified: false, hint_code: result.hintCode ?? null };
  }

  if (!session.tenant_id || !session.user_id) throw new Error("BankID session saknar kundkoppling.");
  const rawStatus = session.raw_status as { signed_payload?: { vehicle_policy_id?: string; vehicle_id?: string; insurance_company_id?: string } } | undefined;
  const vehiclePolicyId = rawStatus?.signed_payload?.vehicle_policy_id;
  if (!session.incident_id && vehiclePolicyId) {
    const payload = rawStatus?.signed_payload ?? { vehicle_policy_id: vehiclePolicyId };
    const signature = buildSignatureRecord({
      tenantId: session.tenant_id,
      userId: session.user_id,
      incidentId: null,
      orderRef: result.orderRef,
      environment: bankidConfig().env,
      pepper: process.env.ENCRYPTION_KEY ?? "dev-only-change-me",
      signedPayload: payload,
      completion: result.completionData,
      ip: ip ?? null,
    });
    await db.from("bankid_signatures" as never).insert({ ...signature, tic_session_id: session.tic_session_id ?? result.sessionId } as never);

    const { data: policyRow } = await db.from("vehicle_insurance_policies" as never)
      .select("id, vehicle_id, insurance_company_id, policy_number, tenant_id")
      .eq("id", vehiclePolicyId)
      .eq("customer_user_id", session.user_id)
      .maybeSingle();
    const policy = policyRow as { id: string; vehicle_id: string; insurance_company_id: string; policy_number: string | null; tenant_id: string | null } | null;
    if (!policy) throw new Error("Försäkringskopplingen hittades inte.");

    await db.from("vehicle_insurance_policies" as never).update({
      is_active: false,
      status: "inactive",
    } as never)
      .eq("vehicle_id", policy.vehicle_id)
      .eq("customer_user_id", session.user_id)
      .neq("id", vehiclePolicyId)
      .eq("is_active", true);

    await db.from("vehicle_insurance_policies" as never).update({
      is_active: true,
      status: "active",
      verified_with_bankid_at: new Date().toISOString(),
    } as never).eq("id", vehiclePolicyId).eq("customer_user_id", session.user_id);

    await db.from("vehicles" as never).update({
      insurance_company_id: policy.insurance_company_id,
      policy_number: policy.policy_number,
      tenant_id: policy.tenant_id ?? session.tenant_id,
    } as never).eq("id", policy.vehicle_id).eq("owner_user_id", session.user_id);

    await db.from("customer_insurance_connections" as never).update({
      status: "active",
      bankid_verified_at: new Date().toISOString(),
    } as never).eq("customer_user_id", session.user_id).eq("tenant_id", session.tenant_id);
    await db.from("audit_logs" as never).insert({
      tenant_id: session.tenant_id,
      actor_user_id: session.user_id,
      action: "sign",
      entity_type: "vehicle_insurance_policy",
      entity_id: vehiclePolicyId,
      fields: ["signed_payload_hash", "personal_number_hash", "environment"],
      metadata: { purpose: session.purpose, provider: "bankid", flow: "vehicle_insurance_connection" },
    } as never);
    return { status: "complete", bankid_verified: true, vehicle_policy_verified: true };
  }

  if (!session.incident_id) throw new Error("BankID session saknar koppling till ärende eller fordon.");
  const { data: incident } = await db.from("incidents" as never)
    .select("id, case_number, type, vehicle_id, insurance_company_id, problem_type, damage_type")
    .eq("id", session.incident_id)
    .maybeSingle();
  if (!incident) throw new Error("Ärendet hittades inte.");
  const inc = incident as { id: string; case_number: string | null; type: string | null; vehicle_id: string | null; insurance_company_id: string | null; problem_type: string | null; damage_type: string | null };
  const payload = signedPayloadForCustomerIncident(inc);
  const signature = buildSignatureRecord({
    tenantId: session.tenant_id,
    userId: session.user_id,
    incidentId: session.incident_id,
    orderRef: result.orderRef,
    environment: bankidConfig().env,
    pepper: process.env.ENCRYPTION_KEY ?? "dev-only-change-me",
    signedPayload: payload,
    completion: result.completionData,
    ip: ip ?? null,
  });
  await db.from("bankid_signatures" as never).insert({ ...signature, tic_session_id: session.tic_session_id ?? result.sessionId } as never);
  await db.from("incidents" as never).update({ status: "bankid_verified", bankid_verified: true } as never).eq("id", session.incident_id);
  await db.from("incident_status_events" as never).insert({
    incident_id: session.incident_id,
    from_status: null,
    to_status: "bankid_verified",
    actor_user_id: session.user_id,
    reason: "BankID-verifiering slutförd av kund",
  } as never);
  await db.from("audit_logs" as never).insert({
    tenant_id: session.tenant_id,
    actor_user_id: session.user_id,
    action: "sign",
    entity_type: "bankid_signature",
    entity_id: session.incident_id,
    fields: ["signed_payload_hash", "personal_number_hash", "environment"],
    metadata: { purpose: session.purpose, provider: "bankid", flow: "customer_incident_verification" },
  } as never);
  return { status: "complete", bankid_verified: true };
}
