import { z } from "zod";
import { coordinateSchema, uuidSchema } from "./common";
import {
  damageTypeSchema,
  dispatchStrategySchema,
  incidentTypeSchema,
  towJobStatusSchema,
  towProblemTypeSchema,
} from "./enums";
import { registrationNumberSchema } from "./vehicle";

export const createIncidentInputSchema = z.object({
  type: incidentTypeSchema,
  vehicle_id: uuidSchema.optional(),
  registration_number: registrationNumberSchema.optional(),
  insurance_company_id: uuidSchema.optional(),
  damage_type: damageTypeSchema.optional(),
  problem_type: towProblemTypeSchema.optional(),
  description: z.string().max(4000).optional(),
  is_drivable: z.boolean().optional(),
  needs_tow: z.boolean().optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
  pickup: coordinateSchema.optional(),
  pickup_address: z.string().optional(),
  destination_address: z.string().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentInputSchema>;

export const addEvidenceInputSchema = z.object({
  storage_path: z.string().min(1),
  content_type: z.string().min(1),
});
export type AddEvidenceInput = z.infer<typeof addEvidenceInputSchema>;

export const bankidSignInputSchema = z.object({
  purpose: z.string().min(1),
  /** Raw personal number is optional and only used transiently to hash. */
  personal_number: z.string().optional(),
});
export type BankidSignInput = z.infer<typeof bankidSignInputSchema>;

export const requestTowInputSchema = z.object({
  pickup: coordinateSchema,
  destination_address: z.string().optional(),
  payer_type: z.enum(["insurance_company", "customer_private"]).default("insurance_company"),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  dispatch_strategy: dispatchStrategySchema.optional(),
});
export type RequestTowInput = z.infer<typeof requestTowInputSchema>;

export const towJobStatusInputSchema = z.object({
  status: towJobStatusSchema,
  reason: z.string().optional(),
});
export type TowJobStatusInput = z.infer<typeof towJobStatusInputSchema>;

export const towJobLocationInputSchema = z.object({
  location: coordinateSchema,
});
export type TowJobLocationInput = z.infer<typeof towJobLocationInputSchema>;

export const towJobCompleteInputSchema = z.object({
  work_performed: z.string().min(1),
  vehicle_picked_up: z.boolean(),
  destination: z.string().optional(),
  waiting_minutes: z.number().int().nonnegative().default(0),
  failed_trip: z.boolean().default(false),
  customer_signed: z.boolean().default(false),
  observed_damages: z.string().optional(),
  comments: z.string().optional(),
});
export type TowJobCompleteInput = z.infer<typeof towJobCompleteInputSchema>;

export const etaCalculateInputSchema = z.object({
  origin: coordinateSchema,
  destination: coordinateSchema,
});
export type EtaCalculateInput = z.infer<typeof etaCalculateInputSchema>;

export const etaMatrixInputSchema = z.object({
  origins: z.array(coordinateSchema).min(1).max(25),
  destinations: z.array(coordinateSchema).min(1).max(25),
});
export type EtaMatrixInput = z.infer<typeof etaMatrixInputSchema>;

export const tenantBrandingPatchSchema = z.object({
  logo_url: z.string().url().optional(),
  support_phone: z.string().optional(),
  support_email: z.string().email().optional(),
  product_name: z.string().optional(),
  color_primary: z.string().optional(),
  color_secondary: z.string().optional(),
});
export type TenantBrandingPatch = z.infer<typeof tenantBrandingPatchSchema>;

export const tenantSettingsPatchSchema = z.object({
  default_dispatch_strategy: dispatchStrategySchema.optional(),
  bankid_required_for_claims: z.boolean().optional(),
  bankid_required_for_tow: z.boolean().optional(),
  max_dispatch_radius_km: z.number().positive().optional(),
  max_dispatch_candidates: z.number().int().positive().optional(),
  offer_expiry_seconds: z.number().int().positive().optional(),
});
export type TenantSettingsPatch = z.infer<typeof tenantSettingsPatchSchema>;
