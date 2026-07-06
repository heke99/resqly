import { createHash } from "node:crypto";
import type { AppSupabaseClient } from "@resqly/database";

export type ConsentKind =
  | "vehicle_insurance_link"
  | "claim_submission"
  | "share_with_insurer"
  | "share_with_tow_partner";

/**
 * Plain-language fallback texts used when a tenant has not published its own
 * active legal version yet. The accepted text (and its hash) is always stored
 * so it can be proven exactly what the customer agreed to.
 */
export const DEFAULT_CONSENT_TEXTS: Record<ConsentKind, string> = {
  vehicle_insurance_link:
    "Jag godkänner att mitt fordon kopplas till valt försäkringsbolag och att kopplingen verifieras med BankID.",
  claim_submission:
    "Jag godkänner att mitt skadeärende med uppgifter om fordon, skada och kontaktuppgifter skickas till mitt försäkringsbolag.",
  share_with_insurer:
    "Jag godkänner att uppgifter om ärendet, fordonet, min position och mina kontaktuppgifter delas med mitt försäkringsbolag för att hantera ärendet.",
  share_with_tow_partner:
    "Jag godkänner att den bärgare som accepterar uppdraget får mitt namn, telefonnummer, fordonets registreringsnummer, upphämtningsplats och destination.",
};

export interface RecordConsentInput {
  tenantId: string;
  userId: string;
  kind: ConsentKind;
  incidentId?: string | null;
  vehicleId?: string | null;
  vehiclePolicyId?: string | null;
  request?: Request;
  metadata?: Record<string, unknown>;
}

/**
 * Store a versioned consent acceptance. Uses the tenant's active legal text
 * when one exists; otherwise the platform default text. Every acceptance is
 * audit-logged with the text hash and version.
 */
export async function recordConsent(db: AppSupabaseClient, input: RecordConsentInput): Promise<void> {
  const { data: version } = await db
    .from("tenant_legal_text_versions" as never)
    .select("id, body, version")
    .eq("tenant_id", input.tenantId)
    .eq("kind", input.kind)
    .eq("status", "active")
    .maybeSingle();
  const versionRow = version as { id: string; body: string; version: number } | null;
  const acceptedText = versionRow?.body ?? DEFAULT_CONSENT_TEXTS[input.kind];
  const textHash = createHash("sha256").update(acceptedText).digest("hex");

  const ip = input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = input.request?.headers.get("user-agent")?.slice(0, 300) ?? null;

  await db.from("customer_consent_acceptances" as never).insert({
    tenant_id: input.tenantId,
    user_id: input.userId,
    legal_version_id: versionRow?.id ?? null,
    consent_kind: input.kind,
    accepted_text_hash: textHash,
    incident_id: input.incidentId ?? null,
    vehicle_id: input.vehicleId ?? null,
    vehicle_policy_id: input.vehiclePolicyId ?? null,
    ip,
    user_agent: userAgent,
    metadata: {
      ...(input.metadata ?? {}),
      text_version: versionRow?.version ?? 0,
      used_default_text: !versionRow,
    },
  } as never);

  await db.from("audit_logs" as never).insert({
    tenant_id: input.tenantId,
    actor_user_id: input.userId,
    action: "consent",
    entity_type: "customer_consent",
    entity_id: input.incidentId ?? input.vehiclePolicyId ?? input.vehicleId ?? input.userId,
    fields: ["consent_kind", "accepted_text_hash"],
    metadata: { consent_kind: input.kind, text_version: versionRow?.version ?? 0 },
  } as never);
}
