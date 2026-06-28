import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./common";
import { fuelTypeSchema, vehicleOwnershipSchema } from "./enums";

/** Normalises e.g. "abc 123" -> "ABC123". */
export const registrationNumberSchema = z
  .string()
  .min(2)
  .max(12)
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ""));

export const vehicleSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema.nullable(),
  owner_user_id: uuidSchema,
  registration_number: z.string(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  vehicle_type: z.string().nullable().optional(),
  fuel_type: fuelTypeSchema.nullable().optional(),
  color: z.string().nullable().optional(),
  vin: z.string().nullable().optional(),
  insurance_company_id: uuidSchema.nullable().optional(),
  policy_number: z.string().nullable().optional(),
  ownership: vehicleOwnershipSchema.default("private"),
  is_default: z.boolean().default(false),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const insuranceCompanySchema = z.object({
  /** The tenant that represents this insurer. */
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string(),
  active: z.boolean().default(true),
});
export type InsuranceCompany = z.infer<typeof insuranceCompanySchema>;

export const vehicleInsurancePolicySchema = z.object({
  id: uuidSchema,
  vehicle_id: uuidSchema,
  insurance_company_id: uuidSchema,
  policy_number: z.string().nullable().optional(),
  valid_from: isoDateTimeSchema.nullable().optional(),
  valid_to: isoDateTimeSchema.nullable().optional(),
});
export type VehicleInsurancePolicy = z.infer<typeof vehicleInsurancePolicySchema>;
