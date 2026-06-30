import { z } from "zod";

/**
 * All cross-cutting enumerations for the platform. These are the single source
 * of truth and are reused by Zod schemas, the database layer and the apps.
 */

export const tenantTypeSchema = z.enum([
  "insurance_company",
  "tow_company",
  "fleet_company",
  "leasing_company",
  "workshop_partner",
  "platform_internal",
]);
export type TenantType = z.infer<typeof tenantTypeSchema>;

export const tenantStatusSchema = z.enum(["active", "suspended", "pending", "archived"]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

/** Roles. `platform_superadmin` is global; the rest are tenant-scoped. */
export const roleKeySchema = z.enum([
  "platform_superadmin",
  // insurance company roles
  "insurance_owner_admin",
  "insurance_claims_handler",
  "insurance_roadside_handler",
  "insurance_fraud_reviewer",
  "insurance_finance",
  "insurance_support",
  "insurance_integration_manager",
  "insurance_viewer",
  // tow company roles
  "tow_owner_admin",
  "tow_dispatcher",
  "tow_driver",
  "tow_vehicle_manager",
  "tow_finance",
  "tow_viewer",
]);
export type RoleKey = z.infer<typeof roleKeySchema>;

export const permissionKeySchema = z.enum([
  "incidents.read",
  "incidents.create",
  "incidents.update",
  "incidents.export",
  "claims.read",
  "claims.submit",
  "claims.approve",
  "tow_jobs.read",
  "tow_jobs.dispatch",
  "tow_jobs.accept",
  "tow_jobs.complete",
  "vehicles.manage",
  "drivers.manage",
  "billing.read",
  "billing.manage",
  "white_label.manage",
  "api_keys.manage",
  "webhooks.manage",
  "audit_logs.read",
]);
export type PermissionKey = z.infer<typeof permissionKeySchema>;

export const vehicleOwnershipSchema = z.enum(["private", "company", "leasing", "rental"]);
export type VehicleOwnership = z.infer<typeof vehicleOwnershipSchema>;

export const fuelTypeSchema = z.enum([
  "petrol",
  "diesel",
  "electric",
  "hybrid",
  "plugin_hybrid",
  "gas",
  "other",
]);
export type FuelType = z.infer<typeof fuelTypeSchema>;

export const damageTypeSchema = z.enum([
  "parking_damage",
  "glass_damage",
  "stone_chip",
  "collision_damage",
  "wildlife_collision",
  "vandalism",
  "vehicle_break_in",
  "stolen_vehicle",
  "fire_damage",
  "water_damage",
  "mechanical_damage",
  "puncture",
  "misfueling",
  "key_problem",
  "battery_problem",
  "towing_after_accident",
  "transport_to_workshop",
  "rental_car_need",
  "workshop_booking",
]);
export type DamageType = z.infer<typeof damageTypeSchema>;

export const towProblemTypeSchema = z.enum([
  "car_does_not_start",
  "puncture",
  "accident",
  "engine_failure",
  "dead_battery",
  "stuck_snow_mud",
  "keys_locked_inside",
  "misfueling",
  "urgent_traffic_danger",
  "transport_to_workshop",
  "ev_out_of_battery",
  "other",
]);
export type TowProblemType = z.infer<typeof towProblemTypeSchema>;

export const incidentTypeSchema = z.enum(["towing", "damage_claim", "roadside_assistance"]);
export type IncidentType = z.infer<typeof incidentTypeSchema>;

/** Lifecycle of an incident / claim record. */
export const incidentStatusSchema = z.enum([
  "draft",
  "awaiting_bankid",
  "bankid_verified",
  "signed",
  "submitted",
  "received",
  "more_info_required",
  "in_progress",
  "completed",
  "closed",
  "cancelled",
  "rejected",
]);
export type IncidentStatus = z.infer<typeof incidentStatusSchema>;

/** Lifecycle of a tow job. */
export const towJobStatusSchema = z.enum([
  "draft",
  "awaiting_bankid",
  "bankid_verified",
  "signed",
  "created",
  "matching",
  "offered",
  "accepted",
  "driver_en_route",
  "driver_arrived",
  "vehicle_loaded",
  "transporting",
  "delivered",
  "completed",
  "invoiced",
  "closed",
  "cancelled",
  "failed",
  "manual_review",
]);
export type TowJobStatus = z.infer<typeof towJobStatusSchema>;

export const towVehicleTypeSchema = z.enum([
  "flatbed",
  "wheel_lift",
  "heavy_tow",
  "motorcycle_tow",
  "service_van",
  "battery_service",
  "tire_service",
  "crane_truck",
  "special_transport",
]);
export type TowVehicleType = z.infer<typeof towVehicleTypeSchema>;

export const dutyStatusSchema = z.enum(["off_duty", "on_duty", "on_call", "busy"]);
export type DutyStatus = z.infer<typeof dutyStatusSchema>;

export const dispatchStrategySchema = z.enum([
  "nearest_available",
  "eta_first",
  "insurance_preferred_network",
  "sla_first",
  "cost_first",
  "manual_dispatch",
  "round_robin",
  "fallback_marketplace",
]);
export type DispatchStrategy = z.infer<typeof dispatchStrategySchema>;

export const offerStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "expired",
  "cancelled",
]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const riskStatusSchema = z.enum([
  "low",
  "medium",
  "high",
  "manual_review_required",
  "blocked_until_verified",
]);
export type RiskStatus = z.infer<typeof riskStatusSchema>;

export const riskFlagSchema = z.enum([
  "bankid_missing",
  "bankid_identity_mismatch",
  "many_cases_short_time",
  "low_gps_accuracy",
  "location_manually_moved_far",
  "missing_photos",
  "photos_uploaded_late",
  "same_device_many_cases",
  "unusual_damage_pattern",
  "repeated_failed_trips",
  "high_cost",
  "unusual_pattern",
]);
export type RiskFlag = z.infer<typeof riskFlagSchema>;

export const bankidEnvSchema = z.enum(["mock", "test", "production"]);
export type BankidEnv = z.infer<typeof bankidEnvSchema>;

export const bankidStatusSchema = z.enum([
  "pending",
  "started",
  "user_sign",
  "complete",
  "failed",
  "cancelled",
  "expired",
]);
export type BankidStatus = z.infer<typeof bankidStatusSchema>;

export const bankidHintCodeSchema = z.enum([
  "outstandingTransaction",
  "noClient",
  "started",
  "userSign",
  "userCancel",
  "expiredTransaction",
  "certificateErr",
  "startFailed",
  "internalError",
]);
export type BankidHintCode = z.infer<typeof bankidHintCodeSchema>;

export const consentTypeSchema = z.enum([
  "insurance_connection",
  "data_sharing",
  "terms_of_service",
  "privacy_policy",
  "marketing",
]);
export type ConsentType = z.infer<typeof consentTypeSchema>;

export const notificationChannelSchema = z.enum(["push", "sms", "email", "in_app", "webhook"]);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const webhookEventSchema = z.enum([
  "incident.created",
  "incident.bankid_started",
  "incident.bankid_verified",
  "incident.signed",
  "incident.submitted",
  "tow.created",
  "tow.requested",
  "tow.dispatch_started",
  "tow.offer_sent",
  "tow.offered",
  "tow.accepted",
  "tow.driver_accepted",
  "tow.en_route",
  "tow.driver_en_route",
  "tow.arrived",
  "tow.driver_arrived",
  "tow.manual_review",
  "tow.cancelled",
  "tow.failed",
  "tow.completed",
  "claim.created",
  "claim.received",
  "claim.more_info_required",
  "billing.invoice_basis_created",
  "fraud.review_required",
]);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookDeliveryStatusSchema = z.enum([
  "pending",
  "delivering",
  "succeeded",
  "failed",
  "exhausted",
]);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const invoiceLineTypeSchema = z.enum([
  "start_fee",
  "kilometers",
  "waiting_time",
  "failed_trip",
  "on_call_surcharge",
  "extra_equipment",
  "heavy_towing",
  "special_vehicle",
  "other",
]);
export type InvoiceLineType = z.infer<typeof invoiceLineTypeSchema>;

export const payerTypeSchema = z.enum(["insurance_company", "customer_private", "fleet", "mixed"]);
export type PayerType = z.infer<typeof payerTypeSchema>;

export const invoiceBasisStatusSchema = z.enum([
  "draft",
  "ready",
  "submitted",
  "approved",
  "rejected",
  "paid",
]);
export type InvoiceBasisStatus = z.infer<typeof invoiceBasisStatusSchema>;

export const auditActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "status_change",
  "data_share",
  "login",
  "logout",
  "consent",
  "sign",
  "export",
  "dispatch",
  "webhook_delivery",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;
