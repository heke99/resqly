"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { newApiKey, normalizePhoneE164, sha256Hex, validatePublicHttpsUrl } from "@resqly/utils";
import type { PermissionKey } from "@resqly/types";
import { requirePortalTenant, requirePortalPermission } from "./auth";
import { PORTAL_AUTH_COOKIE, PORTAL_REFRESH_COOKIE, PORTAL_TENANT_COOKIE } from "./constants";

/** Every mutating action must name the RBAC permission it needs. */
async function portalDb(tenantId: string | null | undefined, permission: PermissionKey) {
  return requirePortalPermission(tenantId, permission);
}

/** Switch the active organization for users who belong to several. */
export async function switchTenant(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  // Only allow switching to organizations the user actually belongs to.
  await requirePortalTenant(tenantId);
  const store = await cookies();
  store.set(PORTAL_TENANT_COOKIE, tenantId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

/** Clear the HttpOnly session cookies and return to the login screen. */
export async function logoutPortal(): Promise<void> {
  const store = await cookies();
  store.delete(PORTAL_AUTH_COOKIE);
  store.delete(PORTAL_REFRESH_COOKIE);
  store.delete(PORTAL_TENANT_COOKIE);
  redirect("/login");
}

function assertTenant(expected: string, actual: string) {
  if (expected !== actual) throw new Error("Du har inte åtkomst till den här organisationen.");
}

async function createOneTimeReveal(
  client: Awaited<ReturnType<typeof portalDb>>["db"],
  tenantId: string,
  userId: string,
  kind: "api_key" | "webhook_secret",
  secret: string,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await client.from("one_time_secret_reveals" as never).insert({
    tenant_id: tenantId,
    token_hash: sha256Hex(token),
    kind,
    secret_value: secret,
    created_by: userId,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  } as never);
  if (error) throw new Error(`Den tillfälliga hemligheten kunde inte skapas: ${error.message}`);
  return token;
}

export async function consumeIntegrationReveal(
  tenantId: string,
  token: string,
): Promise<{ kind: "api_key" | "webhook_secret"; secret: string } | null> {
  const { db: client, tenant } = await requirePortalTenant(tenantId);
  assertTenant(tenant.id, tenantId);
  if (!token || token.length < 32) return null;
  const { data, error } = await client.rpc("consume_one_time_secret" as never, {
    p_tenant_id: tenantId,
    p_token_hash: sha256Hex(token),
  } as never);
  if (error) throw new Error(`Hemligheten kunde inte hämtas: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as { reveal_kind?: string; reveal_secret?: string } | null;
  if (!row?.reveal_secret || (row.reveal_kind !== "api_key" && row.reveal_kind !== "webhook_secret")) return null;
  return { kind: row.reveal_kind, secret: row.reveal_secret };
}

async function setIncidentStatus(
  incidentId: string,
  tenantId: string,
  status: string,
  reason: string | undefined,
  permission: PermissionKey,
) {
  const { db: client, tenant, userId } = await portalDb(tenantId, permission);
  const { data: current } = await client
    .from("incidents" as never)
    .select("status, tenant_id")
    .eq("id", incidentId)
    .maybeSingle();
  const from = (current as { status?: string } | null)?.status ?? null;
  const currentTenantId = (current as { tenant_id?: string } | null)?.tenant_id ?? null;
  if (!currentTenantId) throw new Error("Ärendet hittades inte.");
  assertTenant(tenant.id, currentTenantId);
  await client.from("incidents" as never).update({ status } as never).eq("id", incidentId).eq("tenant_id", tenant.id);
  await client.from("incident_status_events" as never).insert({
    incident_id: incidentId,
    from_status: from,
    to_status: status,
    reason: reason ?? null,
  } as never);
  await client.from("audit_logs" as never).insert({
    tenant_id: currentTenantId,
    actor_user_id: userId,
    action: "status_change",
    entity_type: "incident",
    entity_id: incidentId,
    fields: ["status"],
    metadata: { from, to: status },
  } as never);
  revalidatePath(`/cases/${incidentId}`);
}

export async function approveClaim(formData: FormData): Promise<void> {
  await setIncidentStatus(
    String(formData.get("incident_id")),
    String(formData.get("tenant_id")),
    "in_progress",
    "approved by insurer",
    "claims.approve",
  );
}
export async function rejectClaim(formData: FormData): Promise<void> {
  await setIncidentStatus(
    String(formData.get("incident_id")),
    String(formData.get("tenant_id")),
    "rejected",
    String(formData.get("reason") ?? ""),
    "claims.approve",
  );
}
export async function requestMoreInfo(formData: FormData): Promise<void> {
  await setIncidentStatus(
    String(formData.get("incident_id")),
    String(formData.get("tenant_id")),
    "more_info_required",
    String(formData.get("reason") ?? ""),
    "incidents.update",
  );
}

export async function updateSettings(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId, "white_label.manage");
  assertTenant(tenant.id, tenantId);
  const strategy = String(formData.get("default_dispatch_strategy") ?? "");
  const radius = Number(formData.get("max_dispatch_radius_km") ?? "");
  const patch: Record<string, unknown> = {};
  if (strategy) patch.default_dispatch_strategy = strategy;
  if (!Number.isNaN(radius) && radius > 0) patch.max_dispatch_radius_km = radius;
  // Value dashboard assumptions (insurance tenants).
  const minutesSaved = Number(formData.get("stats_minutes_saved_per_case") ?? "");
  if (Number.isFinite(minutesSaved) && minutesSaved >= 0) patch.stats_minutes_saved_per_case = Math.round(minutesSaved);
  const hourlyCost = Number(formData.get("stats_admin_hourly_cost_sek") ?? "");
  if (Number.isFinite(hourlyCost) && hourlyCost >= 0) patch.stats_admin_hourly_cost_minor = Math.round(hourlyCost * 100);
  if (Object.keys(patch).length) {
    await client.from("tenant_settings" as never).update(patch as never).eq("tenant_id", tenantId);
  }
  const productName = String(formData.get("product_name") ?? "");
  const color = String(formData.get("color_primary") ?? "");
  if (productName) {
    await client.from("tenant_branding" as never).update({ product_name: productName } as never).eq("tenant_id", tenantId);
  }
  if (color) {
    await client.from("tenant_theme_tokens" as never).update({ color_primary: color } as never).eq("tenant_id", tenantId);
  }
  revalidatePath("/settings");
}

interface AdminAuthUser {
  id: string;
  email?: string | null;
}
interface AdminAuthError {
  message?: string;
}

/**
 * Create a driver profile. When an email is given and "send invite" is
 * checked, the driver also gets a login invitation so they can sign in to
 * the driver app (auth account + tenant membership + linked driver row).
 */
export async function createDriver(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId, "drivers.manage");
  assertTenant(tenant.id, tenantId);
  if (tenant.type !== "tow_company") throw new Error("Endast bärgningsbolag kan skapa förare.");

  const { data: company, error: companyError } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (companyError) throw new Error(`Bärgningsbolaget kunde inte läsas: ${companyError.message}`);
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("Organisationen är inte ett bärgningsbolag.");

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const sendInvite = formData.get("send_invite") === "on";
  const rawPhone = String(formData.get("phone") ?? "");
  const phone = rawPhone ? normalizePhoneE164(rawPhone) : null;
  if (!fullName) throw new Error("Ange förarens namn.");
  if (rawPhone && !phone) throw new Error("Ange ett giltigt telefonnummer.");
  if (sendInvite && !email) throw new Error("E-post krävs när en inbjudan ska skickas.");

  if (email && sendInvite) {
    const admin = client.auth.admin as unknown as {
      inviteUserByEmail(
        email: string,
        options?: { redirectTo?: string; data?: Record<string, unknown> },
      ): Promise<{ data: { user: AdminAuthUser | null }; error: AdminAuthError | null }>;
      listUsers(options?: { page?: number; perPage?: number }): Promise<{ data: { users: AdminAuthUser[] }; error: AdminAuthError | null }>;
      deleteUser(userId: string): Promise<{ error: AdminAuthError | null }>;
    };
    const portalBase = process.env.NEXT_PUBLIC_PORTAL_WEB_URL?.replace(/\/$/, "");
    const redirectTo = process.env.DRIVER_INVITE_REDIRECT_URL ?? (portalBase ? `${portalBase}/set-password` : undefined);
    if (!redirectTo && process.env.NODE_ENV === "production") {
      throw new Error("DRIVER_INVITE_REDIRECT_URL eller NEXT_PUBLIC_PORTAL_WEB_URL saknas i produktionsmiljön.");
    }

    const invitation = await admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: fullName, role: "tow_driver" },
    });
    let userId: string | null = invitation.data.user?.id ?? null;
    let newlyInvited = !invitation.error && Boolean(userId);
    if (!userId && (invitation.error?.message?.toLowerCase().includes("already") || invitation.error?.message?.toLowerCase().includes("registered"))) {
      const { data: listed, error: listError } = await admin.listUsers({ page: 1, perPage: 1000 });
      if (listError) throw new Error(`Föraren kunde inte hittas: ${listError.message ?? "okänt fel"}`);
      userId = listed.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
      newlyInvited = false;
      if (userId) {
        const { data: existingMembership, error: membershipError } = await client
          .from("tenant_users" as never)
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("user_id", userId)
          .maybeSingle();
        if (membershipError) throw new Error(`Befintligt konto kunde inte verifieras: ${membershipError.message}`);
        if (!existingMembership) {
          throw new Error("E-postadressen tillhör redan ett annat konto. Kontot måste först godkänna eller administrativt kopplas till bolaget.");
        }
      }
    } else if (invitation.error) {
      throw new Error(`Inbjudan kunde inte skickas: ${invitation.error.message ?? "okänt fel"}`);
    }
    if (!userId) throw new Error("Inbjudan skickades inte och inget användarkonto kunde länkas.");

    const { error: provisionError } = await client.rpc("provision_tow_driver" as never, {
      p_tenant_id: tenantId,
      p_tow_company_id: companyId,
      p_user_id: userId,
      p_email: email,
      p_full_name: fullName,
      p_phone: phone,
    } as never);
    if (provisionError) {
      if (newlyInvited) await admin.deleteUser(userId).catch(() => ({ error: null }));
      throw new Error(`Förarkontot kunde inte kopplas till bolaget: ${provisionError.message}`);
    }
  } else {
    const { error } = await client.from("tow_drivers" as never).insert({
      tenant_id: tenantId,
      tow_company_id: companyId,
      user_id: null,
      full_name: fullName,
      phone,
      email,
      duty_status: "off_duty",
    } as never);
    if (error) throw new Error(`Föraren kunde inte skapas: ${error.message}`);
  }

  revalidatePath("/drivers");
  revalidatePath("/readiness");
}

export async function createTowVehicle(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId, "vehicles.manage");
  assertTenant(tenant.id, tenantId);
  const { data: company } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("Organisationen är inte ett bärgningsbolag.");
  const { data: vehicle } = await client
    .from("tow_vehicles" as never)
    .insert({
      tenant_id: tenantId,
      tow_company_id: companyId,
      registration_number: String(formData.get("registration_number") ?? ""),
      vehicle_type: String(formData.get("vehicle_type") ?? "flatbed"),
      max_weight_kg: Number(formData.get("max_weight_kg") ?? "") || null,
    } as never)
    .select("id")
    .single();
  const vehicleId = (vehicle as unknown as { id: string }).id;
  await client.from("tow_vehicle_capabilities" as never).insert({
    tow_vehicle_id: vehicleId,
    can_handle_ev: formData.get("can_handle_ev") === "on",
    has_flatbed: formData.get("has_flatbed") === "on",
    has_winch: formData.get("has_winch") === "on",
  } as never);
  revalidatePath("/vehicles");
}

export async function createWebhook(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant, userId } = await portalDb(tenantId, "webhooks.manage");
  assertTenant(tenant.id, tenantId);
  const url = validatePublicHttpsUrl(String(formData.get("url") ?? "")).toString();
  const allowedEvents = new Set([
    "incident.created", "incident.bankid_started", "incident.bankid_verified", "incident.signed", "incident.submitted",
    "tow.created", "tow.requested", "tow.dispatch_started", "tow.offer_sent", "tow.offered", "tow.accepted",
    "tow.driver_accepted", "tow.en_route", "tow.driver_en_route", "tow.arrived", "tow.driver_arrived",
    "tow.manual_review", "tow.cancelled", "tow.failed", "tow.completed", "claim.created", "claim.received",
    "claim.more_info_required", "billing.invoice_basis_created", "fraud.review_required",
  ]);
  const events = [...new Set(String(formData.get("events") ?? "")
    .split(",")
    .map((event) => event.trim())
    .filter(Boolean))];
  if (events.length === 0) throw new Error("Välj minst en händelse.");
  const invalid = events.filter((event) => !allowedEvents.has(event));
  if (invalid.length) throw new Error(`Okända händelser: ${invalid.join(", ")}`);
  const secret = randomBytes(32).toString("base64url");
  const { error } = await client.from("tenant_webhooks" as never).insert({
    tenant_id: tenantId,
    url,
    events,
    secret,
  } as never);
  if (error) throw new Error(`Integrationen kunde inte skapas: ${error.message}`);
  const revealToken = await createOneTimeReveal(client, tenantId, userId, "webhook_secret", secret);
  redirect(`/integrations?reveal=${encodeURIComponent(revealToken)}`);
}

async function towCompanyIdFor(client: Awaited<ReturnType<typeof portalDb>>["db"], tenantId: string): Promise<string> {
  const { data: company } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("Organisationen är inte ett bärgningsbolag.");
  return companyId;
}

export async function saveMarketplaceSettings(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId, "white_label.manage");
  assertTenant(tenant.id, tenantId);
  const companyId = await towCompanyIdFor(client, tenantId);
  const row = {
    tow_company_id: companyId,
    accepts_direct_orders: formData.get("accepts_direct_orders") === "on",
    private_customer_enabled: formData.get("private_customer_enabled") === "on",
    active: formData.get("active") === "on",
    min_price_minor: Math.max(0, Math.round(Number(formData.get("min_price_sek") ?? "0") * 100) || 0),
  };
  await client
    .from("tow_company_marketplace_settings" as never)
    .upsert(row as never, { onConflict: "tow_company_id" } as never);
  revalidatePath("/marketplace");
}

function sekToMinor(formData: FormData, key: string): number {
  const value = Number(formData.get(key) ?? "0");
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/**
 * Save the company's private-towing price list. A new active row replaces the
 * old one (history is kept for audit); running jobs are unaffected because
 * their price terms were snapshotted at accept time.
 */
export async function savePriceList(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant, userId } = await portalDb(tenantId, "billing.manage");
  assertTenant(tenant.id, tenantId);
  const companyId = await towCompanyIdFor(client, tenantId);

  const row = {
    tenant_id: tenantId,
    tow_company_id: companyId,
    name: "Fri bärgning",
    start_fee_minor: sekToMinor(formData, "start_fee_sek"),
    per_km_minor: sekToMinor(formData, "per_km_sek"),
    per_waiting_minute_minor: sekToMinor(formData, "per_waiting_minute_sek"),
    failed_trip_minor: sekToMinor(formData, "failed_trip_sek"),
    on_call_surcharge_minor: sekToMinor(formData, "on_call_sek"),
    heavy_tow_minor: sekToMinor(formData, "heavy_tow_sek"),
    minimum_price_minor: sekToMinor(formData, "minimum_price_sek"),
    evening_night_surcharge_minor: sekToMinor(formData, "evening_night_sek"),
    weekend_surcharge_minor: sekToMinor(formData, "weekend_sek"),
    cancellation_policy: nullableText(formData, "cancellation_policy"),
    currency: "SEK",
    active: true,
  };

  await client
    .from("tow_price_lists" as never)
    .update({ active: false } as never)
    .eq("tow_company_id", companyId)
    .eq("active", true);
  await client.from("tow_price_lists" as never).insert(row as never);
  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: "update",
    entity_type: "tow_price_list",
    entity_id: companyId,
    fields: ["start_fee_minor", "per_km_minor", "minimum_price_minor", "surcharges", "cancellation_policy"],
    metadata: {
      start_fee_minor: row.start_fee_minor,
      per_km_minor: row.per_km_minor,
      minimum_price_minor: row.minimum_price_minor,
    },
  } as never);
  revalidatePath("/pricing");
}

export async function saveAgreement(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant, userId } = await portalDb(tenantId, "agreements.request");
  assertTenant(tenant.id, tenantId);
  if (tenant.type !== "tow_company") throw new Error("Endast bärgningsbolag kan skicka avtalsförfrågningar.");
  const companyId = await towCompanyIdFor(client, tenantId);
  const insurerTenantId = String(formData.get("insurance_tenant_id") ?? "");
  if (!insurerTenantId) throw new Error("Välj ett försäkringsbolag.");

  const { data: insurer } = await client
    .from("tenants" as never)
    .select("id, type, status")
    .eq("id", insurerTenantId)
    .eq("type", "insurance_company")
    .maybeSingle();
  if (!insurer || (insurer as { status?: string }).status !== "active") {
    throw new Error("Försäkringsbolaget är inte aktivt eller kunde inte hittas.");
  }

  const requestFields = {
    priority: Math.max(1, Number(formData.get("priority") ?? "100") || 100),
    sla_minutes: Math.max(1, Number(formData.get("sla_minutes") ?? "45") || 45),
    pricing_model: String(formData.get("pricing_model") ?? "standard").trim() || "standard",
  };
  const { data: existing, error: existingError } = await client
    .from("tow_company_insurance_agreements" as never)
    .select("id, status")
    .eq("tow_company_id", companyId)
    .eq("insurance_tenant_id", insurerTenantId)
    .maybeSingle();
  if (existingError) throw new Error(`Avtalsförfrågan kunde inte kontrolleras: ${existingError.message}`);

  let agreementId: string;
  let auditAction: "create" | "update" = "create";
  if (existing) {
    const current = existing as { id: string; status: string };
    if (current.status !== "pending") {
      throw new Error("Avtalet hanteras redan av försäkringsbolaget och kan inte skrivas över av bärgningsbolaget.");
    }
    const { error } = await client
      .from("tow_company_insurance_agreements" as never)
      .update({ ...requestFields, status: "pending", active_from: null, active_to: null } as never)
      .eq("id", current.id)
      .eq("status", "pending");
    if (error) throw new Error(`Avtalsförfrågan kunde inte uppdateras: ${error.message}`);
    agreementId = current.id;
    auditAction = "update";
  } else {
    const { data: saved, error } = await client
      .from("tow_company_insurance_agreements" as never)
      .insert({
        tow_company_id: companyId,
        insurance_tenant_id: insurerTenantId,
        status: "pending",
        active_from: null,
        ...requestFields,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(`Avtalsförfrågan kunde inte sparas: ${error.message}`);
    agreementId = (saved as { id: string }).id;
  }

  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: auditAction,
    entity_type: "tow_company_insurance_agreement_request",
    entity_id: agreementId,
    fields: ["insurance_tenant_id", "status", "priority", "sla_minutes", "pricing_model"],
    metadata: { status: "pending", insurance_tenant_id: insurerTenantId },
  } as never);
  revalidatePath("/agreements");
  revalidatePath("/partners");
}

export async function updateAgreementStatus(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const agreementId = String(formData.get("agreement_id") ?? "");
  const nextStatus = String(formData.get("status") ?? "");
  const allowed = new Set(["active", "suspended", "terminated"]);
  if (!agreementId || !allowed.has(nextStatus)) throw new Error("Ogiltig avtalsändring.");

  const { db: client, tenant, userId } = await portalDb(tenantId, "agreements.manage");
  assertTenant(tenant.id, tenantId);
  if (tenant.type !== "insurance_company" && tenant.type !== "platform_internal") {
    throw new Error("Endast försäkringsbolaget eller plattformsadministratören får godkänna avtal.");
  }

  const { data: current, error: currentError } = await client
    .from("tow_company_insurance_agreements" as never)
    .select("id, insurance_tenant_id, status, active_from")
    .eq("id", agreementId)
    .maybeSingle();
  if (currentError) throw new Error(`Avtalet kunde inte läsas: ${currentError.message}`);
  const agreement = current as { id: string; insurance_tenant_id: string; status: string; active_from: string | null } | null;
  if (!agreement) throw new Error("Avtalet hittades inte.");
  if (tenant.type === "insurance_company" && agreement.insurance_tenant_id !== tenantId) {
    throw new Error("Avtalet tillhör inte den här försäkringsorganisationen.");
  }

  const now = new Date().toISOString();
  const patch = nextStatus === "active"
    ? { status: nextStatus, active_from: agreement.active_from ?? now, active_to: null }
    : nextStatus === "terminated"
      ? { status: nextStatus, active_to: now }
      : { status: nextStatus };
  const { error } = await client
    .from("tow_company_insurance_agreements" as never)
    .update(patch as never)
    .eq("id", agreementId);
  if (error) throw new Error(`Avtalsstatus kunde inte ändras: ${error.message}`);

  await client.from("audit_logs" as never).insert({
    tenant_id: agreement.insurance_tenant_id,
    actor_user_id: userId,
    action: "status_change",
    entity_type: "tow_company_insurance_agreement",
    entity_id: agreementId,
    fields: ["status", "active_from", "active_to"],
    metadata: { from: agreement.status, to: nextStatus },
  } as never);
  revalidatePath("/partners");
  revalidatePath("/readiness");
  revalidatePath("/agreements");
}

export async function setDriverVehicle(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId, "drivers.manage");
  assertTenant(tenant.id, tenantId);
  const driverId = String(formData.get("driver_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "") || null;
  if (!driverId) throw new Error("Välj en förare.");
  await client
    .from("tow_drivers" as never)
    .update({ current_vehicle_id: vehicleId } as never)
    .eq("id", driverId)
    .eq("tenant_id", tenantId);
  revalidatePath("/drivers");
}

/** Create an API key; the raw key is shown once (stored only as a hash). */
export async function createApiKey(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant, userId } = await portalDb(tenantId, "api_keys.manage");
  assertTenant(tenant.id, tenantId);
  const name = String(formData.get("name") ?? "API client");
  const { key, last4 } = newApiKey("rk_live");
  await client.from("tenant_api_clients" as never).insert({
    tenant_id: tenantId,
    name,
    api_key_hash: sha256Hex(key),
    key_last4: last4,
  } as never);
  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: "create",
    entity_type: "api_key",
    entity_id: name,
    fields: ["name", "key_last4"],
    metadata: { key_last4: last4, raw_key_shown_once: true },
  } as never);
  const revealToken = await createOneTimeReveal(client, tenantId, userId, "api_key", key);
  redirect(`/integrations?reveal=${encodeURIComponent(revealToken)}`);
}


function nullableText(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function boolInput(formData: FormData, key: string): boolean {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function numberInput(formData: FormData, key: string, fallback: number): number {
  const value = Number(formData.get(key) ?? "");
  return Number.isFinite(value) ? value : fallback;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function saveLegalVersion(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const { db: client, tenant, userId } = await portalDb(tenantId, "white_label.manage");
  assertTenant(tenant.id, tenantId);
  const kind = String(formData.get("kind") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const version = numberInput(formData, "version", 1);
  const status = String(formData.get("status") ?? "draft");
  if (!kind || !title || !body) throw new Error("Typ, rubrik och text krävs.");

  if (status === "active") {
    await client
      .from("tenant_legal_text_versions" as never)
      .update({ status: "archived", active_to: new Date().toISOString() } as never)
      .eq("tenant_id", tenantId)
      .eq("locale", "sv-SE")
      .eq("kind", kind)
      .eq("status", "active");
  }

  await client.from("tenant_legal_text_versions" as never).upsert(
    {
      tenant_id: tenantId,
      locale: "sv-SE",
      kind,
      title,
      body,
      version,
      status,
      active_from: status === "active" ? new Date().toISOString() : null,
      created_by: userId,
    } as never,
    { onConflict: "tenant_id,locale,kind,version" } as never,
  );
  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: "upsert",
    entity_type: "tenant_legal_text_version",
    entity_id: `${kind}:${version}`,
    fields: ["kind", "version", "status", "body_hash"],
    metadata: { kind, version, status, body_hash: sha256(body) },
  } as never);
  revalidatePath("/legal");
  revalidatePath("/readiness");
}

export async function saveFallbackRule(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const { db: client, tenant, userId } = await portalDb(tenantId, "white_label.manage");
  assertTenant(tenant.id, tenantId);
  const contactsRaw = nullableText(formData, "operational_contacts_json") ?? "[]";
  let contacts: unknown = [];
  try {
    contacts = JSON.parse(contactsRaw);
  } catch {
    throw new Error("Driftkontakter måste vara giltig JSON.");
  }
  await client.from("tenant_notification_fallback_rules" as never).upsert(
    {
      tenant_id: tenantId,
      job_scope: String(formData.get("job_scope") ?? "insurance"),
      enabled: boolInput(formData, "enabled"),
      push_timeout_seconds: numberInput(formData, "push_timeout_seconds", 120),
      push_max_attempts: numberInput(formData, "push_max_attempts", 2),
      insurance_next_wave_radius_km: numberInput(formData, "insurance_next_wave_radius_km", 30),
      private_wave_radius_km: numberInput(formData, "private_wave_radius_km", 15),
      sms_fallback_enabled: boolInput(formData, "sms_fallback_enabled"),
      operational_contacts: contacts,
      expose_sensitive_data_in_sms: boolInput(formData, "expose_sensitive_data_in_sms"),
      manual_review_after_minutes: numberInput(formData, "manual_review_after_minutes", 15),
    } as never,
    { onConflict: "tenant_id,job_scope" } as never,
  );
  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: "upsert",
    entity_type: "tenant_notification_fallback_rule",
    entity_id: String(formData.get("job_scope") ?? "insurance"),
    fields: ["push_timeout_seconds", "sms_fallback_enabled", "operational_contacts"],
  } as never);
  revalidatePath("/notifications");
  revalidatePath("/readiness");
}

export async function saveVehiclePermission(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const { db: client, tenant, userId } = await portalDb(tenantId, "agreements.manage");
  assertTenant(tenant.id, tenantId);
  if (tenant.type !== "insurance_company" && tenant.type !== "platform_internal") {
    throw new Error("Endast försäkringsbolaget får godkänna bärgningsbilar för sitt avtal.");
  }
  const agreementId = String(formData.get("agreement_id") ?? "");
  const towVehicleId = String(formData.get("tow_vehicle_id") ?? "");
  const status = String(formData.get("status") ?? "active");
  const allowedStatuses = new Set(["active", "pending", "suspended", "terminated"]);
  if (!agreementId || !towVehicleId || !allowedStatuses.has(status)) throw new Error("Avtal, bärgningsbil och giltig status krävs.");

  const [{ data: agreement }, { data: vehicle }] = await Promise.all([
    client
      .from("tow_company_insurance_agreements" as never)
      .select("id, insurance_tenant_id, tow_company_id, status")
      .eq("id", agreementId)
      .maybeSingle(),
    client
      .from("tow_vehicles" as never)
      .select("id, tow_company_id")
      .eq("id", towVehicleId)
      .maybeSingle(),
  ]);
  const agreementRow = agreement as { insurance_tenant_id?: string; tow_company_id?: string; status?: string } | null;
  const vehicleRow = vehicle as { tow_company_id?: string } | null;
  if (!agreementRow) throw new Error("Avtalet kunde inte hittas.");
  if (tenant.type === "insurance_company" && agreementRow.insurance_tenant_id !== tenant.id) {
    throw new Error("Avtalet tillhör inte den här försäkringsorganisationen.");
  }
  if (!vehicleRow || vehicleRow.tow_company_id !== agreementRow.tow_company_id) {
    throw new Error("Bärgningsbilen tillhör inte bärgningsbolaget i avtalet.");
  }
  if (status === "active" && agreementRow.status !== "active") {
    throw new Error("Avtalet måste vara aktivt innan en bärgningsbil kan godkännas.");
  }

  const now = new Date().toISOString();
  await client.from("tow_vehicle_insurance_permissions" as never).upsert(
    {
      insurance_agreement_id: agreementId,
      tow_vehicle_id: towVehicleId,
      status,
      active_from: status === "active" ? now : null,
      active_to: status === "terminated" ? now : null,
      notes: nullableText(formData, "notes"),
    } as never,
    { onConflict: "insurance_agreement_id,tow_vehicle_id" } as never,
  );
  await client.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    action: "upsert",
    entity_type: "tow_vehicle_insurance_permission",
    entity_id: towVehicleId,
    fields: ["status", "active_from", "active_to", "notes"],
    metadata: { agreement_id: agreementId, status },
  } as never);
  revalidatePath("/partners");
  revalidatePath("/readiness");
}
