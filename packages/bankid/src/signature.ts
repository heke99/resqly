import type { BankidEnv, BankidStatus } from "@resqly/types";
import { hashPersonalNumber, signedPayloadHash } from "@resqly/utils";
import type { BankidCompletionData } from "./provider";

export interface BuildSignatureInput {
  tenantId: string;
  userId: string;
  incidentId?: string | null;
  orderRef: string;
  environment: BankidEnv;
  /** Server-side pepper (ENCRYPTION_KEY) used to hash the personal number. */
  pepper: string;
  /** The canonical payload the user signed (e.g. the case summary). */
  signedPayload: unknown;
  completion: BankidCompletionData;
  ip?: string | null;
  device?: string | null;
}

/**
 * Build the persistable signature record. The raw personal number is hashed and
 * never stored or returned. Drivers must never receive any of these fields.
 */
export function buildSignatureRecord(input: BuildSignatureInput): {
  tenant_id: string;
  user_id: string;
  incident_id: string | null;
  order_ref: string;
  bankid_status: BankidStatus;
  personal_number_hash: string;
  display_name: string;
  signed_payload_hash: string;
  signature: string;
  environment: BankidEnv;
  ip: string | null;
  device: string | null;
} {
  return {
    tenant_id: input.tenantId,
    user_id: input.userId,
    incident_id: input.incidentId ?? null,
    order_ref: input.orderRef,
    bankid_status: "complete",
    personal_number_hash: hashPersonalNumber(input.completion.personalNumber, input.pepper),
    display_name: input.completion.name,
    signed_payload_hash: signedPayloadHash(input.signedPayload),
    signature: input.completion.signature,
    environment: input.environment,
    ip: input.ip ?? null,
    device: input.device ?? null,
  };
}
