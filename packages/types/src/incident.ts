import { z } from "zod";
import { coordinateSchema, isoDateTimeSchema, uuidSchema } from "./common";
import {
  damageTypeSchema,
  incidentStatusSchema,
  incidentTypeSchema,
  riskFlagSchema,
  riskStatusSchema,
  towProblemTypeSchema,
} from "./enums";

export const incidentSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  case_number: z.string().nullable(),
  customer_user_id: uuidSchema,
  vehicle_id: uuidSchema.nullable(),
  insurance_company_id: uuidSchema.nullable(),
  type: incidentTypeSchema,
  status: incidentStatusSchema.default("draft"),
  damage_type: damageTypeSchema.nullable().optional(),
  problem_type: towProblemTypeSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  is_drivable: z.boolean().nullable().optional(),
  needs_tow: z.boolean().nullable().optional(),
  occurred_at: isoDateTimeSchema.nullable().optional(),
  requires_bankid: z.boolean().default(true),
  bankid_verified: z.boolean().default(false),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type Incident = z.infer<typeof incidentSchema>;

export const incidentLocationSchema = z.object({
  id: uuidSchema,
  incident_id: uuidSchema,
  kind: z.enum(["pickup", "destination"]).default("pickup"),
  coordinate: coordinateSchema,
  address: z.string().nullable().optional(),
  manually_adjusted: z.boolean().default(false),
});
export type IncidentLocation = z.infer<typeof incidentLocationSchema>;

export const incidentEvidenceSchema = z.object({
  id: uuidSchema,
  incident_id: uuidSchema,
  storage_path: z.string(),
  content_type: z.string(),
  uploaded_by: uuidSchema,
  created_at: isoDateTimeSchema,
});
export type IncidentEvidence = z.infer<typeof incidentEvidenceSchema>;

export const incidentStatusEventSchema = z.object({
  id: uuidSchema,
  incident_id: uuidSchema,
  from_status: incidentStatusSchema.nullable(),
  to_status: incidentStatusSchema,
  actor_user_id: uuidSchema.nullable(),
  reason: z.string().nullable().optional(),
  created_at: isoDateTimeSchema,
});
export type IncidentStatusEvent = z.infer<typeof incidentStatusEventSchema>;

export const incidentRiskScoreSchema = z.object({
  id: uuidSchema,
  incident_id: uuidSchema,
  status: riskStatusSchema,
  flags: z.array(riskFlagSchema),
  score: z.number().min(0).max(100),
  created_at: isoDateTimeSchema,
});
export type IncidentRiskScore = z.infer<typeof incidentRiskScoreSchema>;
