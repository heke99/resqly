import type { PermissionKey, RoleKey, TenantType } from "@roadside/types";

/**
 * Role -> permission matrix. This MUST stay in sync with the database seed in
 * migration 0002_role_permissions.sql (the DB copy backs RLS `has_permission`,
 * this copy backs application-layer checks).
 */
export const ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  platform_superadmin: [
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
  ],
  insurance_owner_admin: [
    "incidents.read",
    "incidents.create",
    "incidents.update",
    "incidents.export",
    "claims.read",
    "claims.submit",
    "claims.approve",
    "tow_jobs.read",
    "vehicles.manage",
    "billing.read",
    "billing.manage",
    "white_label.manage",
    "api_keys.manage",
    "webhooks.manage",
    "audit_logs.read",
  ],
  insurance_claims_handler: [
    "incidents.read",
    "incidents.update",
    "claims.read",
    "claims.submit",
    "claims.approve",
    "tow_jobs.read",
  ],
  insurance_roadside_handler: [
    "incidents.read",
    "incidents.create",
    "incidents.update",
    "tow_jobs.read",
    "tow_jobs.dispatch",
  ],
  insurance_fraud_reviewer: ["incidents.read", "claims.read", "audit_logs.read"],
  insurance_finance: ["incidents.read", "billing.read", "billing.manage"],
  insurance_support: ["incidents.read", "claims.read", "tow_jobs.read"],
  insurance_integration_manager: ["incidents.read", "api_keys.manage", "webhooks.manage"],
  insurance_viewer: ["incidents.read", "claims.read", "tow_jobs.read", "billing.read"],
  tow_owner_admin: [
    "tow_jobs.read",
    "tow_jobs.dispatch",
    "tow_jobs.accept",
    "tow_jobs.complete",
    "vehicles.manage",
    "drivers.manage",
    "billing.read",
    "billing.manage",
    "white_label.manage",
    "audit_logs.read",
  ],
  tow_dispatcher: ["tow_jobs.read", "tow_jobs.dispatch", "tow_jobs.accept", "drivers.manage"],
  tow_driver: ["tow_jobs.read", "tow_jobs.accept", "tow_jobs.complete"],
  tow_vehicle_manager: ["vehicles.manage", "drivers.manage", "tow_jobs.read"],
  tow_finance: ["billing.read", "billing.manage", "tow_jobs.read"],
  tow_viewer: ["tow_jobs.read", "billing.read"],
};

export interface RoleMeta {
  key: RoleKey;
  label: string;
  tenantType: TenantType | "platform";
}

export const ROLE_META: RoleMeta[] = [
  { key: "platform_superadmin", label: "Platform Superadmin", tenantType: "platform" },
  { key: "insurance_owner_admin", label: "Owner / Admin", tenantType: "insurance_company" },
  { key: "insurance_claims_handler", label: "Claims Handler", tenantType: "insurance_company" },
  {
    key: "insurance_roadside_handler",
    label: "Roadside Assistance Handler",
    tenantType: "insurance_company",
  },
  { key: "insurance_fraud_reviewer", label: "Fraud / Risk Reviewer", tenantType: "insurance_company" },
  { key: "insurance_finance", label: "Finance", tenantType: "insurance_company" },
  { key: "insurance_support", label: "Support", tenantType: "insurance_company" },
  {
    key: "insurance_integration_manager",
    label: "API / Integration Manager",
    tenantType: "insurance_company",
  },
  { key: "insurance_viewer", label: "Read-only Viewer", tenantType: "insurance_company" },
  { key: "tow_owner_admin", label: "Owner / Admin", tenantType: "tow_company" },
  { key: "tow_dispatcher", label: "Dispatcher", tenantType: "tow_company" },
  { key: "tow_driver", label: "Towing Driver", tenantType: "tow_company" },
  { key: "tow_vehicle_manager", label: "Vehicle Manager", tenantType: "tow_company" },
  { key: "tow_finance", label: "Finance", tenantType: "tow_company" },
  { key: "tow_viewer", label: "Read-only Viewer", tenantType: "tow_company" },
];

export const ALL_PERMISSIONS: PermissionKey[] = ROLE_PERMISSIONS.platform_superadmin;
