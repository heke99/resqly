"use server";

import { revalidatePath } from "next/cache";
import { getServiceClient } from "@roadside/web-kit/server";

/** Superadmin: create a tenant (insurance / tow company / etc.) with defaults. */
export async function createTenant(formData: FormData): Promise<void> {
  const db = getServiceClient();
  if (!db) throw new Error("Supabase is not configured (set env vars).");

  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const prefix = String(formData.get("case_number_prefix") ?? "")
    .trim()
    .toUpperCase();
  if (!name || !slug || !prefix || !type) throw new Error("All fields are required.");

  const { data, error } = await db
    .from("tenants" as never)
    .insert({ type, name, slug, case_number_prefix: prefix } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const tenantId = (data as { id: string }).id;

  // Default config rows so the tenant is immediately usable.
  await db.from("tenant_settings" as never).insert({ tenant_id: tenantId } as never);
  await db.from("tenant_branding" as never).insert({ tenant_id: tenantId, product_name: name } as never);
  await db.from("tenant_theme_tokens" as never).insert({ tenant_id: tenantId } as never);
  await db.from("tenant_feature_flags" as never).insert({ tenant_id: tenantId } as never);

  if (type === "insurance_company") {
    await db.from("insurance_companies" as never).insert({ tenant_id: tenantId, name } as never);
  }
  if (type === "tow_company") {
    await db.from("tow_companies" as never).insert({ tenant_id: tenantId, name } as never);
  }

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    action: "create",
    entity_type: "tenant",
    entity_id: tenantId,
    fields: ["name", "slug", "case_number_prefix"],
  } as never);

  revalidatePath("/tenants");
}

/** Superadmin/tenant admin: update tenant branding + prefix. */
export async function updateTenantBranding(formData: FormData): Promise<void> {
  const db = getServiceClient();
  if (!db) throw new Error("Supabase is not configured.");
  const tenantId = String(formData.get("tenant_id") ?? "");
  const productName = String(formData.get("product_name") ?? "");
  const colorPrimary = String(formData.get("color_primary") ?? "");
  const prefix = String(formData.get("case_number_prefix") ?? "").toUpperCase();

  if (productName) {
    await db
      .from("tenant_branding" as never)
      .update({ product_name: productName } as never)
      .eq("tenant_id", tenantId);
  }
  if (colorPrimary) {
    await db
      .from("tenant_theme_tokens" as never)
      .update({ color_primary: colorPrimary } as never)
      .eq("tenant_id", tenantId);
  }
  if (prefix) {
    await db.from("tenants" as never).update({ case_number_prefix: prefix } as never).eq("id", tenantId);
  }
  revalidatePath(`/tenants/${tenantId}`);
}

/** Superadmin: create the first tenant admin user (owner/admin). */
export async function createTenantAdmin(formData: FormData): Promise<void> {
  const db = getServiceClient();
  if (!db) throw new Error("Supabase is not configured.");
  const tenantId = String(formData.get("tenant_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const roleKey = String(formData.get("role_key") ?? "insurance_owner_admin");
  if (!email) throw new Error("Email is required.");

  const { data: created, error } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(error.message);
  const userId = created.user.id;

  await db.from("user_profiles" as never).upsert({ id: userId, email, full_name: fullName } as never);
  await db.from("tenant_users" as never).insert({ tenant_id: tenantId, user_id: userId } as never);
  await db.from("user_roles" as never).insert({ tenant_id: tenantId, user_id: userId, role_key: roleKey } as never);

  await db.from("audit_logs" as never).insert({
    tenant_id: tenantId,
    action: "create",
    entity_type: "tenant_user",
    entity_id: userId,
    fields: ["email", "role_key"],
  } as never);

  revalidatePath(`/tenants/${tenantId}`);
}
