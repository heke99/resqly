import { NextResponse } from "next/server";

/** Liveness + configuration health (no secrets, no user data). */
export async function GET() {
  const checks = {
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_anon_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const ok = checks.supabase_url && checks.supabase_anon_key && checks.supabase_service_role;
  return NextResponse.json({ ok, app: "portal-web", checks }, { status: ok ? 200 : 503 });
}
