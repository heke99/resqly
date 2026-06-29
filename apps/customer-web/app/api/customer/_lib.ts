import { NextResponse } from "next/server";
import { getServiceClient } from "@resqly/web-kit/server";
import type { AppSupabaseClient } from "@resqly/database";

type AuthUser = { id: string; email?: string | null; user_metadata?: Record<string, unknown> };

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireCustomer(request: Request): Promise<{ db: AppSupabaseClient; user: AuthUser } | NextResponse> {
  const db = getServiceClient();
  if (!db) return jsonError(503, "Supabase is not configured.");
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!token) return jsonError(401, "Missing bearer token.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return jsonError(401, "Invalid or expired session.");
  const user = data.user as AuthUser;
  const email = user.email ?? null;
  const fullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null;
  await db.from("user_profiles" as never).upsert({ id: user.id, email, full_name: fullName } as never);
  return { db, user };
}

export function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/[\s-]/g, "");
}
