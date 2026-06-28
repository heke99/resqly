import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServiceClient } from "@resqly/web-kit/server";
import type { AppSupabaseClient } from "@resqly/database";
import { ADMIN_AUTH_COOKIE } from "./constants";

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export interface AdminSession {
  db: AppSupabaseClient;
  user: AuthUser;
  profile: { id: string; email: string | null; is_platform_admin: boolean };
}

async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ADMIN_AUTH_COOKIE)?.value ?? null;
}

async function getUser(db: AppSupabaseClient, token: string): Promise<AuthUser | null> {
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user as AuthUser;
}

async function ensureProfile(db: AppSupabaseClient, user: AuthUser) {
  const email = user.email ?? null;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  await db.from("user_profiles" as never).upsert({ id: user.id, email, full_name: fullName } as never);
}

async function maybeBootstrapFirstSuperadmin(db: AppSupabaseClient, user: AuthUser): Promise<void> {
  const configured = process.env.FIRST_SUPERADMIN_EMAIL?.trim().toLowerCase();
  const email = user.email?.trim().toLowerCase();
  if (!configured || !email || configured !== email) return;

  const { data: existing } = await db
    .from("user_profiles" as never)
    .select("id")
    .eq("is_platform_admin", true)
    .limit(1);
  if (((existing as unknown[] | null) ?? []).length > 0) return;

  await db.from("user_profiles" as never).update({ is_platform_admin: true } as never).eq("id", user.id);
  await db.from("audit_logs" as never).insert({
    tenant_id: null,
    actor_user_id: user.id,
    action: "grant_role",
    entity_type: "platform_admin",
    entity_id: user.id,
    fields: ["is_platform_admin"],
    metadata: { bootstrap: true },
  } as never);
}

export async function requirePlatformAdmin(): Promise<AdminSession> {
  const db = getServiceClient();
  if (!db) throw new Error("Supabase is not configured (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).");

  const token = await getToken();
  if (!token) redirect("/login");

  const user = await getUser(db, token);
  if (!user) redirect("/login?error=session_expired");

  await ensureProfile(db, user);
  await maybeBootstrapFirstSuperadmin(db, user);

  const { data: profile, error } = await db
    .from("user_profiles" as never)
    .select("id, email, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile) redirect("/login?error=profile_missing");

  const p = profile as { id: string; email: string | null; is_platform_admin: boolean };
  if (!p.is_platform_admin) redirect("/login?error=unauthorized");

  return { db, user, profile: p };
}
