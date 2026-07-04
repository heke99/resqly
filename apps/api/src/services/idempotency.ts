import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";

/**
 * Scope for replay protection. End-user requests are scoped per user;
 * partner API requests are scoped per tenant.
 */
export function idempotencyScope(ctx: ApiContext): string {
  return ctx.userId ? `user:${ctx.userId}` : `tenant:${ctx.tenantId}`;
}

/**
 * If the caller supplied an Idempotency-Key header and a previous request with
 * the same scope + action + key succeeded, replay the stored response instead
 * of re-executing (prevents duplicate cases/tow requests from double clicks
 * and mobile retries). Only 2xx responses are stored.
 */
export async function withIdempotency(
  ctx: ApiContext,
  action: string,
  handler: () => Promise<RouteResult>,
  getResourceId?: (result: RouteResult) => string | null,
): Promise<RouteResult> {
  const key = ctx.idempotencyKey;
  if (!key) return handler();

  const scope = idempotencyScope(ctx);
  const existing = await ctx.repo.findIdempotentResponse(scope, action, key);
  if (existing) {
    return {
      status: 200,
      body: existing.response as Record<string, unknown>,
      headers: { "x-idempotent-replay": "true" },
    };
  }

  const result = await handler();
  if (result.status >= 200 && result.status < 300) {
    await ctx.repo
      .storeIdempotentResponse(scope, action, key, getResourceId?.(result) ?? null, result.body ?? null)
      .catch(() => undefined);
  }
  return result;
}
