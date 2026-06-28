import type { AccessContext, PermissionKey, RoleKey } from "@roadside/types";
import { forbidden } from "@roadside/utils";
import { ROLE_PERMISSIONS } from "./matrix";

/** Resolve the unique set of permissions granted by a set of roles. */
export function permissionsForRoles(roles: RoleKey[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  return [...set];
}

export interface BuildAccessContextInput {
  userId: string;
  tenantId: string | null;
  isPlatformAdmin: boolean;
  roles: RoleKey[];
}

export function buildAccessContext(input: BuildAccessContextInput): AccessContext {
  const roles = input.isPlatformAdmin
    ? Array.from(new Set<RoleKey>([...input.roles, "platform_superadmin"]))
    : input.roles;
  return {
    user_id: input.userId,
    tenant_id: input.tenantId,
    is_platform_admin: input.isPlatformAdmin,
    roles,
    permissions: permissionsForRoles(roles),
  };
}

/**
 * Core permission check. Platform admins pass everything. Otherwise the context
 * must hold the permission AND (when a tenant is specified) be scoped to that
 * tenant.
 */
export function can(
  ctx: AccessContext,
  permission: PermissionKey,
  tenantId?: string | null,
): boolean {
  if (ctx.is_platform_admin) return true;
  if (tenantId && ctx.tenant_id !== tenantId) return false;
  return ctx.permissions.includes(permission);
}

/** Throws a 403 AppError when the permission is missing. */
export function assertCan(
  ctx: AccessContext,
  permission: PermissionKey,
  tenantId?: string | null,
): void {
  if (!can(ctx, permission, tenantId)) {
    throw forbidden(`Missing permission: ${permission}`);
  }
}

export function hasAnyPermission(
  ctx: AccessContext,
  permissions: PermissionKey[],
  tenantId?: string | null,
): boolean {
  return permissions.some((p) => can(ctx, p, tenantId));
}
