"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "./auth";

type TenantType =
  | "insurance_company"
  | "tow_company"
  | "fleet_company"
  | "leasing_company"
  | "workshop_partner"
  | "platform_internal";

const INSURANCE_ROLES = new Set([
  "insurance_owner_admin",
  "insurance_claims_handler",
  "insurance_roadside_handler",
  "insurance_fraud_reviewer",
  "insurance_finance",
  "insurance_support",
  "insurance_integration_manager",
  "insurance_viewer",
]);
const TOW_ROLES = new Set([
  "tow_owner_admin",
  "tow_dispatcher",
  "tow_driver",
  "tow_vehicle_manager",
  "tow_finance",
  "tow_viewer",
]);

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function numberOrNull(formData: FormData, key: string): number | null {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function normaliseSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function assertRoleMatchesTenant(type: string, roleKey: string): void {
  if (type === "insurance_company" && !INSURANCE_ROLES.has(roleKey)) {
    throw new Error("Insurance tenants can only receive insurance roles.");
  }
  if (type === "tow_company" && !TOW_ROLES.has(roleKey)) {
    throw new Error("Tow tenants can only receive towing roles.");
  }
}

function portalBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_PORTAL_WEB_URL ?? "https://portal.resqly.se").replace(/\/$/, "");
}

type AdminAuthUser = { id: string; email?: string | null };
type AdminAuthError = { message: string } | null;

async function findExistingAuthUserIdByEmail(db: Awaited<ReturnType<typeof requirePlatformAdmin>>["db"], email: string): Promise<string | null> {
  const { data: profile } = await db
    .from("user_profiles" as never)
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
  const profileId = (profile as { id?: string } | null)?.id;
  if (profileId) return profileId;

  const admin = db.auth.admin as unknown as {
    listUsers(options?: { page?: number; perPage?: number }): Promise<{ data: { users: AdminAuthUser[] }; error: AdminAuthError }>;
  };
  const { data, error } = await admin.listUsers({ page: 1, perPage: 1000 });
  if (error) return null;
  return data.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
}

async function invitePortalUser(input: {
  db: Awaited<ReturnType<typeof requirePlatformAdmin>>["db"];
  tenantType: string;
  email: string;
  fullName: string | null;
  roleKey: string;
}): Promise<{ userId: string; invitationSent: boolean; invitationError?: string }> {
  const admin = input.db.auth.admin as unknown as {
    inviteUserByEmail(
      email: string,
      options?: { redirectTo?: string; data?: Record<string, unknown> },
    ): Promise<{ data: { user: AdminAuthUser | null }; error: AdminAuthError }>;
  };

  const redirectTo = `${portalBaseUrl()}/set-password`;
  const { data, error } = await admin.inviteUserByEmail(input.email, {
    redirectTo,
    data: {
      full_name: input.fullName ?? undefined,
      tenant_type: input.tenantType,
      role_key: input.roleKey,
    },
  });

  if (!error && data.user?.id) {
    return { userId: data.user.id, invitationSent: true };
  }

  const existingUserId = await findExistingAuthUserIdByEmail(input.db, input.email);
  if (existingUserId) {
    return { userId: existingUserId, invitationSent: false, invitationError: error?.message };
  }

  throw new Error(error?.message ?? "Could not invite portal user.");
}

async function createTenantAdminForTenant(input: {
  tenantId: string;
  tenantType: string;
  email: string;
  fullName: string | null;
  roleKey: string;
  actorUserId: string;
}) {
  assertRoleMatchesTenant(input.tenantType, input.roleKey);
  const { db } = await requirePlatformAdmin();
  const invite = await invitePortalUser({
    db,
    tenantType: input.tenantType,
    email: input.email,
    fullName: input.fullName,
    roleKey: input.roleKey,
  });
  const userId = invite.userId;

  await db.from("user_profiles" as never).upsert({ id: userId, email: input.email, full_name: input.fullName } as never);
  await db.from("tenant_users" as never).upsert({ tenant_id: input.tenantId, user_id: userId, status: "active" } as never, { onConflict: "tenant_id,user_id" } as never);
  await db.from("user_roles" as never).upsert({ tenant_id: input.tenantId, user_id: userId, role_key: input.roleKey } as never, { onConflict: "tenant_id,user_id,role_key" } as never);

  await db.from("audit_logs" as never).insert({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    action: "invite",
    entity_type: "tenant_user",
    entity_id: userId,
    fields: ["email", "role_key", "invitation"],
    metadata: {
      role_key: input.roleKey,
      invitation_sent: invite.invitationSent,
      invitation_error: invite.invitationError ?? null,
      set_password_url: `${portalBaseUrl()}/set-password`,
    },
  } as never);
}

/** Superadmin: create a complete white-label tenant with defaults, branding and optional first admin. */
export async function createTenant(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();

  const type = String(formData.get("type") ?? "") as TenantType;
  const name = text(formData, "name");
  const slug = normaliseSlug(text(formData, "slug") ?? "");
  const prefix = (text(formData, "case_number_prefix") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!name || !slug || !prefix || !type) throw new Error("Type, name, slug and case prefix are required.");

  const productName = text(formData, "product_name") ?? name;
  const logoUrl = text(formData, "logo_url");
  const logoDarkUrl = text(formData, "logo_dark_url");
  const faviconUrl = text(formData, "favicon_url");
  const supportPhone = text(formData, "support_phone");
  const supportEmail = text(formData, "support_email");
  const supportUrl = text(formData, "support_url");
  const customDomain = text(formData, "custom_domain")?.toLowerCase();
  const colorPrimary = text(formData, "color_primary") ?? "#0B5FFF";
  const colorSecondary = text(formData, "color_secondary") ?? "#1F2937";
  const colorBackground = text(formData, "color_background") ?? "#FFFFFF";
  const terms = text(formData, "terms_of_service");
  const privacy = text(formData, "privacy_policy");
  const adminEmail = text(formData, "admin_email")?.toLowerCase();
  const adminName = text(formData, "admin_full_name");
  let roleKey = text(formData, "admin_role_key") ?? (type === "tow_company" ? "tow_owner_admin" : "insurance_owner_admin");
  if (type === "tow_company" && roleKey.startsWith("insurance_")) roleKey = "tow_owner_admin";
  if (type === "insurance_company" && roleKey.startsWith("tow_")) roleKey = "insurance_owner_admin";

  if (adminEmail && (type === "insurance_company" || type === "tow_company")) {
    assertRoleMatchesTenant(type, roleKey);
  }

  const { data, error } = await db
    .from("tenants" as never)
    .insert({ type, name, slug, case_number_prefix: prefix, status: "active" } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const tenantId = (data as { id: string }).id;

  await db.from("tenant_branding" as never).insert({
    tenant_id: tenantId,
    product_name: productName,
    logo_url: logoUrl,
    logo_dark_url: logoDarkUrl,
    favicon_url: faviconUrl,
    support_phone: supportPhone,
    support_email: supportEmail,
    support_url: supportUrl,
  } as never);
  await db.from("tenant_theme_tokens" as never).insert({
    tenant_id: tenantId,
    color_primary: colorPrimary,
    color_secondary: colorSecondary,
    color_background: colorBackground,
  } as never);
  await db.from("tenant_settings" as never).insert({
    tenant_id: tenantId,
    default_dispatch_strategy: text(formData, "default_dispatch_strategy") ?? "eta_first",
    bankid_required_for_claims: bool(formData, "bankid_required_for_claims"),
    bankid_required_for_tow: bool(formData, "bankid_required_for_tow"),
    allow_marketplace_fallback: bool(formData, "allow_marketplace_fallback"),
    max_dispatch_radius_km: numberOrNull(formData, "max_dispatch_radius_km") ?? 50,
  } as never);
  await db.from("tenant_feature_flags" as never).insert({
    tenant_id: tenantId,
    damage_claims_enabled: bool(formData, "damage_claims_enabled"),
    marketplace_enabled: bool(formData, "marketplace_enabled"),
    realtime_tracking_enabled: true,
  } as never);
  await db.from("tenant_legal_texts" as never).insert({
    tenant_id: tenantId,
    locale: "sv-SE",
    terms_of_service: terms,
    privacy_policy: privacy,
  } as never);
  if (customDomain) {
    await db.from("tenant_domains" as never).insert({ tenant_id: tenantId, domain: customDomain, is_primary: true, verified: false } as never);
  }

  if (type === "insurance_company") {
    await db.from("insurance_companies" as never).insert({ tenant_id: tenantId, name } as never);
  }
  if (type === "tow_company") {
    await db.from("tow_companies" as never).insert({ tenant_id: tenantId, name } as never);
  }

  if (adminEmail && (type === "insurance_company" || type === "tow_company")) {
    await createTenantAdminForTenant({ tenantId, tenantType: type, email: adminEmail, fullName: adminName, roleKey, actorUserId: user.id });
  }

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: "create",
    entity_type: "tenant",
    entity_id: tenantId,
    fields: ["name", "slug", "case_number_prefix", "branding", "settings"],
    metadata: { customer_link: `${process.env.NEXT_PUBLIC_CUSTOMER_WEB_URL ?? "https://app.resqly.se"}/partner/${slug}` },
  } as never);

  revalidatePath("/");
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
}

/** Superadmin/tenant admin: update tenant branding + prefix + white-label settings. */
export async function updateTenantBranding(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const tenantId = String(formData.get("tenant_id") ?? "");
  if (!tenantId) throw new Error("tenant_id is required.");

  const prefix = text(formData, "case_number_prefix")?.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (prefix) {
    await db.from("tenants" as never).update({ case_number_prefix: prefix } as never).eq("id", tenantId);
  }

  await db.from("tenant_branding" as never).upsert({
    tenant_id: tenantId,
    product_name: text(formData, "product_name"),
    logo_url: text(formData, "logo_url"),
    logo_dark_url: text(formData, "logo_dark_url"),
    favicon_url: text(formData, "favicon_url"),
    support_phone: text(formData, "support_phone"),
    support_email: text(formData, "support_email"),
    support_url: text(formData, "support_url"),
  } as never);

  await db.from("tenant_theme_tokens" as never).upsert({
    tenant_id: tenantId,
    color_primary: text(formData, "color_primary") ?? "#0B5FFF",
    color_secondary: text(formData, "color_secondary") ?? "#1F2937",
    color_background: text(formData, "color_background") ?? "#FFFFFF",
  } as never);

  await db.from("tenant_settings" as never).upsert({
    tenant_id: tenantId,
    default_dispatch_strategy: text(formData, "default_dispatch_strategy") ?? "eta_first",
    bankid_required_for_claims: bool(formData, "bankid_required_for_claims"),
    bankid_required_for_tow: bool(formData, "bankid_required_for_tow"),
    allow_marketplace_fallback: bool(formData, "allow_marketplace_fallback"),
    max_dispatch_radius_km: numberOrNull(formData, "max_dispatch_radius_km") ?? 50,
  } as never);

  await db.from("tenant_feature_flags" as never).upsert({
    tenant_id: tenantId,
    damage_claims_enabled: bool(formData, "damage_claims_enabled"),
    marketplace_enabled: bool(formData, "marketplace_enabled"),
    realtime_tracking_enabled: true,
  } as never);

  await db.from("tenant_legal_texts" as never).upsert({
    tenant_id: tenantId,
    locale: "sv-SE",
    terms_of_service: text(formData, "terms_of_service"),
    privacy_policy: text(formData, "privacy_policy"),
  } as never, { onConflict: "tenant_id,locale" } as never);

  const domain = text(formData, "custom_domain")?.toLowerCase();
  if (domain) {
    await db.from("tenant_domains" as never).upsert({ tenant_id: tenantId, domain, is_primary: true } as never, { onConflict: "domain" } as never);
  }

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "tenant_branding",
    entity_id: tenantId,
    fields: ["branding", "theme", "settings", "legal"],
  } as never);
  revalidatePath(`/tenants/${tenantId}`);
}

/** Superadmin: create/update an agreement between a tow company and an insurer. */
export async function upsertAgreement(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const towCompanyId = text(formData, "tow_company_id");
  const insurerTenantId = text(formData, "insurance_tenant_id");
  if (!towCompanyId || !insurerTenantId) throw new Error("Tow company and insurance company are required.");
  await db.from("tow_company_insurance_agreements" as never).upsert(
    {
      tow_company_id: towCompanyId,
      insurance_tenant_id: insurerTenantId,
      status: text(formData, "status") ?? "active",
      priority: numberOrNull(formData, "priority") ?? 100,
      sla_minutes: numberOrNull(formData, "sla_minutes") ?? 45,
      pricing_model: text(formData, "pricing_model") ?? "standard",
    } as never,
    { onConflict: "tow_company_id,insurance_tenant_id" } as never,
  );
  await db.from("audit_logs" as never).insert({
    tenant_id: insurerTenantId,
    actor_user_id: user.id,
    action: "update",
    entity_type: "tow_company_insurance_agreement",
    entity_id: towCompanyId,
    fields: ["status", "priority", "sla_minutes"],
  } as never);
  revalidatePath("/agreements");
}

/** Superadmin: update a tow company's direct marketplace settings. */
export async function upsertMarketplace(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const towCompanyId = text(formData, "tow_company_id");
  if (!towCompanyId) throw new Error("Tow company is required.");
  await db.from("tow_company_marketplace_settings" as never).upsert(
    {
      tow_company_id: towCompanyId,
      accepts_direct_orders: bool(formData, "accepts_direct_orders"),
      private_customer_enabled: bool(formData, "private_customer_enabled"),
      active: bool(formData, "active"),
      min_price_minor: Math.max(0, Math.round((numberOrNull(formData, "min_price_sek") ?? 0) * 100)),
    } as never,
    { onConflict: "tow_company_id" } as never,
  );
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "update",
    entity_type: "tow_company_marketplace_settings",
    entity_id: towCompanyId,
    fields: ["accepts_direct_orders", "active"],
  } as never);
  revalidatePath("/agreements");
}

/** Superadmin: create a tenant admin user (owner/admin/role-specific). */
export async function createTenantAdmin(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const tenantId = String(formData.get("tenant_id") ?? "");
  const email = text(formData, "email")?.toLowerCase();
  const fullName = text(formData, "full_name");
  const roleKey = text(formData, "role_key") ?? "insurance_owner_admin";
  if (!email) throw new Error("Email is required.");

  const { data: tenant } = await db.from("tenants" as never).select("type").eq("id", tenantId).maybeSingle();
  const tenantType = (tenant as { type?: string } | null)?.type;
  if (!tenantType) throw new Error("Tenant not found.");

  await createTenantAdminForTenant({ tenantId, tenantType, email, fullName, roleKey, actorUserId: user.id });
  revalidatePath(`/tenants/${tenantId}`);
}

/** Superadmin: create the deterministic staging demo constellation. Do not run this in production. */
export async function createStagingDemo(_formData?: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (appEnv === "production") {
    throw new Error("Staging demo seed is blocked in production.");
  }
  const { error } = await db.rpc("create_resqly_staging_demo" as never, {} as never);
  if (error) throw new Error(error.message);
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "create",
    entity_type: "staging_demo",
    entity_id: "create_resqly_staging_demo",
    fields: ["tenants", "agreements", "vehicles", "fallback", "legal"],
    metadata: { app_env: appEnv },
  } as never);
  revalidatePath("/");
  revalidatePath("/readiness");
  revalidatePath("/agreements");
}
