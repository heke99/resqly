import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServiceClient } from "@resqly/web-kit/server";
import type { AppSupabaseClient } from "@resqly/database";
import { PORTAL_AUTH_COOKIE } from "./constants";

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export interface PortalSession {
  db: AppSupabaseClient;
  user: AuthUser;
}

export interface PortalTenant {
  id: string;
  name: string;
  slug: string;
  type: string;
  case_number_prefix: string;
}

async function token(): Promise<string | null> {
  const store = await cookies();
  return store.get(PORTAL_AUTH_COOKIE)?.value ?? null;
}

async function session(): Promise<PortalSession> {
  const db = getServiceClient();
  if (!db) throw new Error("Supabase is not configured.");
  const accessToken = await token();
  if (!accessToken) redirect("/login");
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data.user) redirect("/login?error=session_expired");

  const user = data.user as AuthUser;
  const email = user.email ?? null;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  await db.from("user_profiles" as never).upsert({ id: user.id, email, full_name: fullName } as never);
  return { db, user };
}

export async function getPortalTenants(): Promise<{ db: AppSupabaseClient; userId: string; tenants: PortalTenant[] }> {
  const { db, user } = await session();
  const { data: memberships, error } = await db
    .from("tenant_users" as never)
    .select("tenant_id")
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  const tenantIds = ((memberships as Array<{ tenant_id: string }> | null) ?? []).map((m) => m.tenant_id);
  if (tenantIds.length === 0) return { db, userId: user.id, tenants: [] };

  const { data: tenants } = await db
    .from("tenants" as never)
    .select("id, name, slug, type, case_number_prefix")
    .in("id", tenantIds);

  return {
    db,
    userId: user.id,
    tenants: (tenants as PortalTenant[] | null) ?? [],
  };
}

export async function requirePortalTenant(tenantId?: string | null): Promise<{ db: AppSupabaseClient; userId: string; tenant: PortalTenant }> {
  const { db, userId, tenants } = await getPortalTenants();
  const tenant = tenantId ? tenants.find((t) => t.id === tenantId) : tenants[0];
  if (!tenant) redirect("/login?error=no_tenant_access");
  return { db, userId, tenant };
}

/**
 * Best-effort active tenant for layout/navigation. Never redirects (so it is
 * safe on /login and /set-password). Returns null when unauthenticated.
 */
export async function getOptionalActiveTenant(): Promise<PortalTenant | null> {
  try {
    const accessToken = await token();
    if (!accessToken) return null;
    const db = getServiceClient();
    if (!db) return null;
    const { data, error } = await db.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const { data: memberships } = await db
      .from("tenant_users" as never)
      .select("tenant_id")
      .eq("user_id", data.user.id)
      .eq("status", "active");
    const ids = ((memberships as Array<{ tenant_id: string }> | null) ?? []).map((m) => m.tenant_id);
    if (ids.length === 0) return null;
    const { data: tenants } = await db
      .from("tenants" as never)
      .select("id, name, slug, type, case_number_prefix")
      .in("id", ids);
    return ((tenants as PortalTenant[] | null) ?? [])[0] ?? null;
  } catch {
    return null;
  }
}
