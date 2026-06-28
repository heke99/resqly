import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";
import {
  bankidEnvSchema,
  bankidHintCodeSchema,
  bankidStatusSchema,
  consentTypeSchema,
} from "./enums";

/** Personal number is hashed before storage; raw value never persisted. */
export const bankidSessionSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema.nullable(),
  incident_id: uuidSchema.nullable(),
  order_ref: z.string(),
  status: bankidStatusSchema,
  hint_code: bankidHintCodeSchema.nullable().optional(),
  environment: bankidEnvSchema,
  purpose: z.string(),
  created_at: isoDateTimeSchema,
  completed_at: isoDateTimeSchema.nullable().optional(),
});
export type BankidSession = z.infer<typeof bankidSessionSchema>;

export const bankidSignatureSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  incident_id: uuidSchema.nullable(),
  order_ref: z.string(),
  bankid_status: bankidStatusSchema,
  personal_number_hash: z.string(),
  display_name: z.string(),
  signed_payload_hash: z.string(),
  signature: z.string(),
  environment: bankidEnvSchema,
  ip: z.string().nullable().optional(),
  device: z.string().nullable().optional(),
  created_at: isoDateTimeSchema,
  completed_at: isoDateTimeSchema.nullable().optional(),
});
export type BankidSignature = z.infer<typeof bankidSignatureSchema>;

export const consentRecordSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  consent_type: consentTypeSchema,
  granted: z.boolean(),
  version: z.string(),
  created_at: isoDateTimeSchema,
});
export type ConsentRecord = z.infer<typeof consentRecordSchema>;

/** What the insurer is permitted to see; drivers never receive any of this. */
export const identityVerificationViewSchema = z.object({
  verified: z.boolean(),
  display_name: z.string().nullable(),
  verified_at: isoDateTimeSchema.nullable(),
  environment: bankidEnvSchema,
});
export type IdentityVerificationView = z.infer<typeof identityVerificationViewSchema>;
