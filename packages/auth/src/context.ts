import type { AccessContext, RoleKey } from "@resqly/types";
import { buildAccessContext } from "@resqly/rbac";
import type { AppSupabaseClient } from "@resqly/database";

export interface ProfileRow {
  id: string;
  is_platform_admin: boolean;
}

/** Pure builder, decoupled from the database for testability. */
export function accessContextFromRows(
  profile: ProfileRow,
  roleKeys: RoleKey[],
  tenantId: string | null,
): AccessContext {
  return buildAccessContext({
    userId: profile.id,
    tenantId,
    isPlatformAdmin: profile.is_platform_admin,
    roles: roleKeys,
  });
}

/**
 * Load a user's access context for a given tenant from the database. Pass a
 * service-role client; authorization decisions are made from the returned
 * context, never from the raw client.
 */
export async function loadAccessContext(
  client: AppSupabaseClient,
  userId: string,
  tenantId: string | null,
): Promise<AccessContext> {
  const profileRes = await client
    .from("user_profiles")
    .select("id, is_platform_admin")
    .eq("id", userId)
    .single();
  if (profileRes.error) throw new Error(`Failed to load profile: ${profileRes.error.message}`);
  const profile = profileRes.data as unknown as ProfileRow;

  let roleKeys: RoleKey[] = [];
  if (tenantId) {
    const rolesRes = await client
      .from("user_roles")
      .select("role_key")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId);
    if (rolesRes.error) throw new Error(`Failed to load roles: ${rolesRes.error.message}`);
    roleKeys = ((rolesRes.data ?? []) as Array<{ role_key: RoleKey }>).map((r) => r.role_key);
  }

  return accessContextFromRows(profile, roleKeys, tenantId);
}
