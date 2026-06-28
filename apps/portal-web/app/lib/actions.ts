"use server";

import { revalidatePath } from "next/cache";
import { newApiKey, sha256Hex, newId } from "@resqly/utils";
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
    secret: newId(),
  } as never);
  revalidatePath("/integrations");
}

/** Create an API key; the raw key is shown once (stored only as a hash). */
export async function createApiKey(formData: FormData): Promise<void> {
  const tenantId = String(formData.get("tenant_id"));
  const { db: client, tenant } = await portalDb(tenantId);
  assertTenant(tenant.id, tenantId);
  const name = String(formData.get("name") ?? "API client");
  const { key, last4 } = newApiKey("rk_live");
  await client.from("tenant_api_clients" as never).insert({
    tenant_id: tenantId,
    name,
    api_key_hash: sha256Hex(key),
    key_last4: last4,
  } as never);
  // In production the raw key is surfaced once via a flash message; omitted here.
  revalidatePath("/integrations");
}
