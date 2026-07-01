"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { newApiKey, sha256Hex } from "@resqly/utils";
import { requirePortalTenant } from "./auth";

async function portalDb(tenantId?: string | null) {
  return requirePortalTenant(tenantId);
}

function assertTenant(expected: string, actual: string) {
  if (expected !== actual) throw new Error("You do not have access to this tenant.");
}

async function setIncidentStatus(incidentId: string, tenantId: string, status: string, reason?: string) {
  const { db: client, tenant, userId } = await portalDb(tenantId);
  const { data: current } = await client
    .from("incidents" as never)
    .select("status, tenant_id")
    .eq("id", incidentId)
    .maybeSingle();
  const from = (current as { status?: string } | null)?.status ?? null;
  const currentTenantId = (current as { tenant_id?: string } | null)?.tenant_id ?? null;
  if (!currentTenantId) throw new Error("Case not found.");
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
  await setIncidentStatus(String(formData.get("incident_id")), String(formData.get("tenant_id")), "in_progress", "approved by insurer");
}
export async function rejectClaim(formData: FormData): Promise<void> {
  await setIncidentStatus(String(formData.get("incident_id")), String(formData.get("tenant_id")), "rejected", String(formData.get("reason") ?? ""));
}
export async function requestMoreInfo(formData: FormData): Promise<void> {
  await setIncidentStatus(
    String(formData.get("incident_id")),
    String(formData.get("tenant_id")),
    "more_info_required",
    String(formData.get("reason") ?? ""),
  );
}

export async function updateSettings(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const strategy = String(formData.get("default_dispatch_strategy") ?? "");
  const radius = Number(formData.get("max_dispatch_radius_km") ?? "");
  const patch: Record<string, unknown> = {};
  if (strategy) patch.default_dispatch_strategy = strategy;
  if (!Number.isNaN(radius) && radius > 0) patch.max_dispatch_radius_km = radius;
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

export async function createDriver(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const { data: company } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("This tenant is not a tow company.");
  await client.from("tow_drivers" as never).insert({
    tenant_id: tenantId,
    tow_company_id: companyId,
    full_name: String(formData.get("full_name") ?? ""),
    phone: String(formData.get("phone") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    duty_status: "off_duty",
  } as never);
  revalidatePath("/drivers");
}

export async function createTowVehicle(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const { data: company } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("This tenant is not a tow company.");
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
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const url = String(formData.get("url") ?? "");
  const events = String(formData.get("events") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  await client.from("tenant_webhooks" as never).insert({
    tenant_id: tenantId,
    url,
    events,
    secret: randomBytes(32).toString("base64url"),
  } as never);
  revalidatePath("/integrations");
}

async function towCompanyIdFor(client: Awaited<ReturnType<typeof portalDb>>["db"], tenantId: string): Promise<string> {
  const { data: company } = await client
    .from("tow_companies" as never)
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const companyId = (company as { id?: string } | null)?.id;
  if (!companyId) throw new Error("This tenant is not a tow company.");
  return companyId;
}

export async function saveMarketplaceSettings(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
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

export async function saveAgreement(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const companyId = await towCompanyIdFor(client, tenantId);
  const insurerTenantId = String(formData.get("insurance_tenant_id") ?? "");
  if (!insurerTenantId) throw new Error("Select an insurance company.");
  const row = {
    tow_company_id: companyId,
    insurance_tenant_id: insurerTenantId,
    status: String(formData.get("status") ?? "active"),
    priority: Number(formData.get("priority") ?? "100") || 100,
    sla_minutes: Number(formData.get("sla_minutes") ?? "45") || 45,
    pricing_model: String(formData.get("pricing_model") ?? "standard"),
  };
  await client
    .from("tow_company_insurance_agreements" as never)
    .upsert(row as never, { onConflict: "tow_company_id,insurance_tenant_id" } as never);
  revalidatePath("/agreements");
}

export async function setDriverVehicle(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const driverId = String(formData.get("driver_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "") || null;
  if (!driverId) throw new Error("Driver is required.");
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
  const { db: client, tenant, userId } = await portalDb(tenantId);
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
  redirect(`/integrations?new_key=${encodeURIComponent(key)}`);
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
  const { db: client, tenant, userId } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const kind = String(formData.get("kind") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const version = numberInput(formData, "version", 1);
  const status = String(formData.get("status") ?? "draft");
  if (!kind || !title || !body) throw new Error("Kind, title and body are required.");

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
  const { db: client, tenant, userId } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const contactsRaw = nullableText(formData, "operational_contacts_json") ?? "[]";
  let contacts: unknown = [];
  try {
    contacts = JSON.parse(contactsRaw);
  } catch {
    throw new Error("Operational contacts must be valid JSON.");
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
  const { db: client, tenant, userId } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const agreementId = String(formData.get("agreement_id") ?? "");
  const towVehicleId = String(formData.get("tow_vehicle_id") ?? "");
  const status = String(formData.get("status") ?? "active");
  if (!agreementId || !towVehicleId) throw new Error("Agreement and tow vehicle are required.");

  const { data: agreement } = await client
    .from("tow_company_insurance_agreements" as never)
    .select("id, insurance_tenant_id")
    .eq("id", agreementId)
    .maybeSingle();
  if ((agreement as { insurance_tenant_id?: string } | null)?.insurance_tenant_id !== tenant.id) {
    throw new Error("Agreement does not belong to this insurer tenant.");
  }

  await client.from("tow_vehicle_insurance_permissions" as never).upsert(
    {
      insurance_agreement_id: agreementId,
      tow_vehicle_id: towVehicleId,
      status,
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
    fields: ["status", "notes"],
    metadata: { agreement_id: agreementId, status },
  } as never);
  revalidatePath("/partners");
  revalidatePath("/readiness");
}
