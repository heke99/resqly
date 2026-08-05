import type { ApiContext } from "../context";

export function apiActorFields(ctx: ApiContext): Record<string, unknown> {
  const apiClientId =
    !ctx.userId && ctx.apiClientId && !["public", "user-token"].includes(ctx.apiClientId)
      ? ctx.apiClientId
      : null;
  return {
    actor_user_id: ctx.userId ?? null,
    actor_api_client_id: apiClientId,
    actor_kind: ctx.userId ? "user" : apiClientId ? "api_client" : "system",
  };
}

export async function recordApiAudit(
  ctx: ApiContext,
  row: Record<string, unknown>,
): Promise<void> {
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    ...apiActorFields(ctx),
    ...row,
  });
}
