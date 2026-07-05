"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  createSupabaseDispatchStore,
  loadDispatchSettings,
  orchestrateDispatch,
} from "@resqly/dispatch";
import { requirePlatformAdmin } from "./auth";
import { ADMIN_AUTH_COOKIE, ADMIN_REFRESH_COOKIE } from "./constants";

/** Clear the HttpOnly session cookies and return to the login screen. */
export async function logoutAdmin(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_AUTH_COOKIE);
  store.delete(ADMIN_REFRESH_COOKIE);
  redirect("/login");
}

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

/** Platform admin: approve/pause a tow vehicle for a specific insurer agreement. */
export async function saveVehiclePermissionAdmin(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const agreementId = text(formData, "agreement_id");
  const towVehicleId = text(formData, "tow_vehicle_id");
  const status = text(formData, "status") ?? "active";
  if (!agreementId || !towVehicleId) throw new Error("Avtal och bärgningsbil krävs.");
  await db.from("tow_vehicle_insurance_permissions" as never).upsert(
    {
      insurance_agreement_id: agreementId,
      tow_vehicle_id: towVehicleId,
      status,
    } as never,
    { onConflict: "insurance_agreement_id,tow_vehicle_id" } as never,
  );
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "upsert",
    entity_type: "tow_vehicle_insurance_permission",
    entity_id: towVehicleId,
    fields: ["status"],
    metadata: { agreement_id: agreementId, status },
  } as never);
  revalidatePath("/agreements");
  revalidatePath("/readiness");
}

/** Platform admin: retry a failed integration delivery. */
export async function retryIntegrationDelivery(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const deliveryId = text(formData, "delivery_id");
  if (!deliveryId) throw new Error("Leverans-id krävs.");
  await db
    .from("webhook_deliveries" as never)
    .update({ status: "pending", next_attempt_at: new Date().toISOString(), last_error: null } as never)
    .eq("id", deliveryId);
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "retry",
    entity_type: "webhook_delivery",
    entity_id: deliveryId,
    fields: ["status"],
  } as never);
  revalidatePath("/operations");
}

/** Platform admin: retry a failed operational notification. */
export async function retryOperationalNotification(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const id = text(formData, "notification_id");
  if (!id) throw new Error("Notis-id krävs.");
  await db
    .from("operational_notification_queue" as never)
    .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null } as never)
    .eq("id", id);
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "retry",
    entity_type: "operational_notification",
    entity_id: id,
    fields: ["status"],
  } as never);
  revalidatePath("/operations");
}

/** Platform admin: mark a manual help case as resolved. */
export async function resolveManualReview(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const id = text(formData, "review_id");
  if (!id) throw new Error("Ärende-id krävs.");
  await db.from("manual_reviews" as never).update({ status: "resolved" } as never).eq("id", id);
  await db.from("audit_logs" as never).insert({
    actor_user_id: user.id,
    action: "update",
    entity_type: "manual_review",
    entity_id: id,
    fields: ["status"],
    metadata: { status: "resolved" },
  } as never);
  revalidatePath("/operations");
}

/**
 * Support tool: re-dispatch a stuck/failed tow job. Cancels remaining pending
 * offers and runs the shared dispatch orchestrator again from the case's
 * pickup location. Only allowed while no driver is assigned.
 */
export async function adminRedispatchJob(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const jobId = text(formData, "tow_job_id");
  if (!jobId) throw new Error("Uppdrags-id krävs.");

  const { data: job } = await db
    .from("tow_jobs" as never)
    .select("id, tenant_id, incident_id, status, driver_id, payer_type, priority")
    .eq("id", jobId)
    .maybeSingle();
  const j = job as {
    id: string;
    tenant_id: string;
    incident_id: string;
    status: string;
    driver_id: string | null;
    payer_type: string;
    priority: string;
  } | null;
  if (!j) throw new Error("Uppdraget hittades inte.");
  if (j.driver_id) throw new Error("Uppdraget har redan en förare. Avbryt uppdraget först om det ska omfördelas.");
  if (["completed", "invoiced", "closed", "cancelled"].includes(j.status)) {
    throw new Error("Uppdraget är avslutat och kan inte skickas ut igen.");
  }

  const { data: loc } = await db
    .from("incident_locations" as never)
    .select("lat, lng")
    .eq("incident_id", j.incident_id)
    .eq("kind", "pickup")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pickup = loc as { lat: number | null; lng: number | null } | null;
  if (!pickup || pickup.lat == null || pickup.lng == null) {
    throw new Error("Ärendet saknar upphämtningsposition — bekräfta adressen med kunden först.");
  }

  await db
    .from("tow_job_offers" as never)
    .update({ status: "cancelled" } as never)
    .eq("tow_job_id", j.id)
    .eq("status", "pending");

  const { data: incident } = await db
    .from("incidents" as never)
    .select("problem_type, case_number")
    .eq("id", j.incident_id)
    .maybeSingle();
  const inc = incident as { problem_type: string | null; case_number: string | null } | null;

  const settings = await loadDispatchSettings(db, j.tenant_id);
  const outcome = await orchestrateDispatch(
    createSupabaseDispatchStore(db),
    {
      tenantId: j.tenant_id,
      job: { id: j.id, incident_id: j.incident_id, status: j.status },
      pickup: { lat: Number(pickup.lat), lng: Number(pickup.lng) },
      payerType: j.payer_type === "customer_private" ? "customer_private" : "insurance_company",
      priority: (["normal", "high", "urgent"].includes(j.priority) ? j.priority : "normal") as "normal" | "high" | "urgent",
      problemType: inc?.problem_type ?? null,
      caseNumber: inc?.case_number ?? null,
      actorUserId: user.id,
      settings,
    },
    { push: { enabled: process.env.EXPO_PUSH_ENABLED !== "false" } },
  );

  await db.from("audit_logs" as never).insert({
    tenant_id: j.tenant_id,
    actor_user_id: user.id,
    action: "dispatch",
    entity_type: "tow_job",
    entity_id: j.id,
    fields: ["status"],
    metadata: { manual_redispatch: true, outcome: outcome.status, offers: outcome.offeredDrivers.length },
  } as never);
  revalidatePath(`/cases/${j.incident_id}`);
  revalidatePath("/operations");
}

/** Support tool: cancel a case (and its live tow job) with a mandatory reason. */
export async function adminCancelCase(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const incidentId = text(formData, "incident_id");
  const reason = text(formData, "reason");
  if (!incidentId) throw new Error("Ärende-id krävs.");
  if (!reason) throw new Error("Ange en anledning till att ärendet avbryts.");

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, status")
    .eq("id", incidentId)
    .maybeSingle();
  const inc = incident as { id: string; tenant_id: string; status: string } | null;
  if (!inc) throw new Error("Ärendet hittades inte.");
  if (["closed", "cancelled"].includes(inc.status)) throw new Error("Ärendet är redan avslutat.");

  const { data: jobs } = await db
    .from("tow_jobs" as never)
    .select("id, status")
    .eq("incident_id", inc.id)
    .not("status", "in", "(cancelled,failed,closed)" as never);
  for (const job of (jobs as Array<{ id: string; status: string }> | null) ?? []) {
    await db.from("tow_job_offers" as never).update({ status: "cancelled" } as never).eq("tow_job_id", job.id).eq("status", "pending");
    await db.from("tow_jobs" as never).update({ status: "cancelled" } as never).eq("id", job.id);
    await db.from("tow_job_status_events" as never).insert({
      tow_job_id: job.id,
      from_status: job.status,
      to_status: "cancelled",
      actor_user_id: user.id,
      reason: `avbruten av plattformsansvarig: ${reason}`,
    } as never);
  }

  await db.from("incidents" as never).update({ status: "cancelled" } as never).eq("id", inc.id);
  await db.from("incident_status_events" as never).insert({
    incident_id: inc.id,
    from_status: inc.status,
    to_status: "cancelled",
    actor_user_id: user.id,
    reason,
  } as never);
  await db.from("audit_logs" as never).insert({
    tenant_id: inc.tenant_id,
    actor_user_id: user.id,
    action: "status_change",
    entity_type: "incident",
    entity_id: inc.id,
    fields: ["status"],
    metadata: { from: inc.status, to: "cancelled", manual_override: true, reason },
  } as never);
  revalidatePath(`/cases/${inc.id}`);
}

/** Support tool: mark a stuck job as completed manually (with reason). */
export async function adminCompleteJob(formData: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const jobId = text(formData, "tow_job_id");
  const reason = text(formData, "reason");
  if (!jobId) throw new Error("Uppdrags-id krävs.");
  if (!reason) throw new Error("Ange en anledning till manuell slutförning.");

  const { data: job } = await db
    .from("tow_jobs" as never)
    .select("id, tenant_id, incident_id, status")
    .eq("id", jobId)
    .maybeSingle();
  const j = job as { id: string; tenant_id: string; incident_id: string; status: string } | null;
  if (!j) throw new Error("Uppdraget hittades inte.");
  if (["completed", "invoiced", "closed", "cancelled"].includes(j.status)) {
    throw new Error("Uppdraget är redan avslutat.");
  }

  await db.from("tow_job_offers" as never).update({ status: "cancelled" } as never).eq("tow_job_id", j.id).eq("status", "pending");
  await db.from("tow_jobs" as never).update({ status: "completed" } as never).eq("id", j.id);
  await db.from("tow_job_status_events" as never).insert({
    tow_job_id: j.id,
    from_status: j.status,
    to_status: "completed",
    actor_user_id: user.id,
    reason: `manuellt slutförd av plattformsansvarig: ${reason}`,
  } as never);
  await db.from("incidents" as never).update({ status: "completed" } as never).eq("id", j.incident_id);
  await db.from("incident_status_events" as never).insert({
    incident_id: j.incident_id,
    from_status: null,
    to_status: "completed",
    actor_user_id: user.id,
    reason: `bärgningen slutförd manuellt: ${reason}`,
  } as never);
  await db.from("audit_logs" as never).insert({
    tenant_id: j.tenant_id,
    actor_user_id: user.id,
    action: "status_change",
    entity_type: "tow_job",
    entity_id: j.id,
    fields: ["status"],
    metadata: { from: j.status, to: "completed", manual_override: true, reason },
  } as never);
  revalidatePath(`/cases/${j.incident_id}`);
}

/** Superadmin: create the deterministic staging demo constellation. Do not run this in production. */
export async function createStagingDemo(_formData?: FormData): Promise<void> {
  const { db, user } = await requirePlatformAdmin();
  const appEnv = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "development").toLowerCase();
  if (appEnv === "production") {
    throw new Error("Demodata kan inte skapas i produktionsmiljön.");
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
