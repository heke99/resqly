import { forbidden, notFound } from "@resqly/utils";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";

/**
 * GET /api/v1/me/role-context
 * Returns the authenticated user's aggregated role/capability context derived
 * from user_profiles, tenant_users, user_roles, the driver record, and customer
 * ownership. Mobile/web clients use this to decide which app surfaces to enable
 * and to offer mode switching when a user has multiple roles.
 */
export async function getRoleContext(ctx: ApiContext): Promise<RouteResult> {
  const userId = ctx.userId ?? null;
  if (!userId) throw forbidden("An authenticated user access token is required");
  const context = await ctx.repo.loadRoleContext(userId);
  if (!context) throw notFound("User profile not found");
  return { status: 200, body: context };
}
