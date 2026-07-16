import { NextResponse } from "next/server";
import { getServiceClient } from "@resqly/web-kit/server";
import type { AppSupabaseClient } from "@resqly/database";
import { normalizePhoneE164 } from "@resqly/utils";

type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> };

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireCustomer(request: Request): Promise<{ db: AppSupabaseClient; user: AuthUser } | NextResponse> {
  const db = getServiceClient();
  if (!db) return jsonError(503, "Tjänsten är tillfälligt otillgänglig. Försök igen om en stund.");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return jsonError(401, "Du behöver logga in igen.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return jsonError(401, "Din session har gått ut. Logga in igen.");
  const user = data.user as AuthUser;
  const email = user.email ?? null;
  const authName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const authPhone = typeof user.user_metadata?.phone === "string" ? normalizePhoneE164(user.user_metadata.phone) : null;
  const patch: Record<string, unknown> = { id: user.id, email };
  // Never replace already-complete profile values with null metadata from an
  // older account. Metadata only fills values when it is actually present.
  if (authName) patch.full_name = authName;
  if (authPhone) patch.phone = authPhone;
  await db.from("user_profiles" as never).upsert(patch as never);
  return { db, user };
}

export async function getCompleteCustomerProfile(db: AppSupabaseClient, userId: string) {
  const { data } = await db
    .from("user_profiles" as never)
    .select("full_name, phone, email")
    .eq("id", userId)
    .maybeSingle();
  const row = data as { full_name?: string | null; phone?: string | null; email?: string | null } | null;
  const fullName = row?.full_name?.trim() ?? "";
  const phone = row?.phone ? normalizePhoneE164(row.phone) : null;
  return fullName.length >= 2 && phone
    ? { fullName, phone, email: row?.email ?? null }
    : null;
}

export function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/[\s-]/g, "");
}

/** Swedish registration numbers: ABC123 or ABC12A (after normalization). */
export function isValidSwedishReg(normalized: string): boolean {
  return /^[A-ZÅÄÖ]{3}\d{2}[A-ZÅÄÖ\d]$/.test(normalized);
}

/**
 * Replay protection for customer actions. If the client sent an
 * Idempotency-Key header and the same user already completed the same action
 * with the same key, the stored response is returned instead of re-executing.
 */
export async function replayIfIdempotent(
  db: AppSupabaseClient,
  userId: string,
  action: string,
  request: Request,
): Promise<{ key: string | null; replay: NextResponse | null }> {
  const key = request.headers.get("idempotency-key") ?? request.headers.get("x-idempotency-key");
  if (!key) return { key: null, replay: null };
  const { data } = await db
    .from("request_idempotency_keys" as never)
    .select("response")
    .eq("scope", `user:${userId}`)
    .eq("action", action)
    .eq("idempotency_key", key)
    .maybeSingle();
  const stored = data as { response: unknown } | null;
  if (!stored) return { key, replay: null };
  return {
    key,
    replay: NextResponse.json(stored.response ?? {}, { status: 200, headers: { "x-idempotent-replay": "true" } }),
  };
}

export async function storeIdempotentResponse(
  db: AppSupabaseClient,
  userId: string,
  action: string,
  key: string | null,
  resourceId: string | null,
  response: unknown,
): Promise<void> {
  if (!key) return;
  await db
    .from("request_idempotency_keys" as never)
    .upsert(
      {
        scope: `user:${userId}`,
        action,
        idempotency_key: key,
        resource_id: resourceId,
        response,
      } as never,
      { onConflict: "scope,action,idempotency_key", ignoreDuplicates: true } as never,
    );
}
