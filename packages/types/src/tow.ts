import { z } from "zod";
import { coordinateSchema, isoDateTimeSchema, moneySchema, uuidSchema } from "./common";
import {
  dutyStatusSchema,
  offerStatusSchema,
  towJobStatusSchema,
  towVehicleTypeSchema,
} from "./enums";

export const towCompanySchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string(),
  active: z.boolean().default(true),
});
export type TowCompany = z.infer<typeof towCompanySchema>;

export const towVehicleCapabilitiesSchema = z.object({
  can_tow_car: z.boolean().default(true),
  can_tow_light_truck: z.boolean().default(false),
  can_tow_heavy_truck: z.boolean().default(false),
  can_tow_motorcycle: z.boolean().default(false),
  can_handle_ev: z.boolean().default(false),
  has_flatbed: z.boolean().default(false),
  has_wheel_lift: z.boolean().default(false),
  has_crane: z.boolean().default(false),
  has_winch: z.boolean().default(false),
  has_battery_booster: z.boolean().default(false),
  has_tire_service: z.boolean().default(false),
  has_fuel_service: z.boolean().default(false),
});
export type TowVehicleCapabilities = z.infer<typeof towVehicleCapabilitiesSchema>;

export const towVehicleSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_company_id: uuidSchema,
  registration_number: z.string(),
  vehicle_type: towVehicleTypeSchema,
  max_weight_kg: z.number().int().positive().nullable().optional(),
  capacity_notes: z.string().nullable().optional(),
  capabilities: towVehicleCapabilitiesSchema,
  status: z.enum(["active", "inactive", "maintenance"]).default("active"),
  inspection_valid_until: isoDateTimeSchema.nullable().optional(),
  insurance_valid_until: isoDateTimeSchema.nullable().optional(),
  last_service_at: isoDateTimeSchema.nullable().optional(),
  gps_device_id: z.string().nullable().optional(),
  current_driver_id: uuidSchema.nullable().optional(),
  duty_status: dutyStatusSchema.default("off_duty"),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type TowVehicle = z.infer<typeof towVehicleSchema>;

export const towDriverSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_company_id: uuidSchema,
  user_id: uuidSchema.nullable(),
  full_name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  license_classes: z.array(z.string()).default([]),
  current_vehicle_id: uuidSchema.nullable().optional(),
  zone: z.string().nullable().optional(),
  languages: z.array(z.string()).default([]),
  bankid_verified: z.boolean().default(false),
  last_location: coordinateSchema.nullable().optional(),
  last_seen_at: isoDateTimeSchema.nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  accept_rate: z.number().min(0).max(1).nullable().optional(),
  duty_status: dutyStatusSchema.default("off_duty"),
});
export type TowDriver = z.infer<typeof towDriverSchema>;

export const towJobSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  incident_id: uuidSchema,
  tow_company_id: uuidSchema.nullable(),
  driver_id: uuidSchema.nullable(),
  tow_vehicle_id: uuidSchema.nullable(),
  status: towJobStatusSchema.default("created"),
  payer_type: z.enum(["insurance_company", "customer_private"]).default("insurance_company"),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  sla_deadline: isoDateTimeSchema.nullable().optional(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});
export type TowJob = z.infer<typeof towJobSchema>;

export const towJobOfferSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_job_id: uuidSchema,
  driver_id: uuidSchema,
  tow_company_id: uuidSchema,
  status: offerStatusSchema.default("pending"),
  rank: z.number().int().nonnegative(),
  expires_at: isoDateTimeSchema,
  created_at: isoDateTimeSchema,
});
export type TowJobOffer = z.infer<typeof towJobOfferSchema>;

export const towJobEtaSnapshotSchema = z.object({
  id: uuidSchema,
  tow_job_id: uuidSchema,
  driver_id: uuidSchema.nullable(),
  eta_seconds: z.number().int().nonnegative(),
  distance_meters: z.number().nonnegative(),
  source: z.enum(["google_routes", "google_matrix", "haversine_fallback", "last_known"]),
  degraded: z.boolean().default(false),
  created_at: isoDateTimeSchema,
});
export type TowJobEtaSnapshot = z.infer<typeof towJobEtaSnapshotSchema>;

/**
 * The exact subset of customer data shared with a driver AFTER accepting a job.
 * Never includes personal identity number, BankID details, insurance history,
 * fraud score, internal notes or unrelated cases.
 */
export const towJobCustomerShareSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_job_id: uuidSchema,
  driver_id: uuidSchema,
  shared_fields: z.array(z.string()),
  customer_name: z.string(),
  customer_phone: z.string(),
  customer_email: z.string().nullable(),
  registration_number: z.string(),
  problem_summary: z.string(),
  pickup_location: coordinateSchema,
  pickup_address: z.string().nullable(),
  destination_address: z.string().nullable(),
  customer_notes: z.string().nullable(),
  reason: z.string(),
  created_at: isoDateTimeSchema,
});
export type TowJobCustomerShare = z.infer<typeof towJobCustomerShareSchema>;

export const towCompletionReportSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  tow_job_id: uuidSchema,
  driver_id: uuidSchema,
  work_performed: z.string(),
  vehicle_picked_up: z.boolean(),
  destination: z.string().nullable().optional(),
  waiting_minutes: z.number().int().nonnegative().default(0),
  failed_trip: z.boolean().default(false),
  customer_signed: z.boolean().default(false),
  observed_damages: z.string().nullable().optional(),
  comments: z.string().nullable().optional(),
  extra_costs: moneySchema.nullable().optional(),
  created_at: isoDateTimeSchema,
});
export type TowCompletionReport = z.infer<typeof towCompletionReportSchema>;
