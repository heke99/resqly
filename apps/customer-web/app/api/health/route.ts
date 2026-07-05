import { NextResponse } from "next/server";

/** Liveness + configuration health (no secrets, no user data). */
export async function GET() {
  const checks = {
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_anon_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_service_role: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    maps: Boolean(process.env.GOOGLE_MAPS_SERVER_KEY),
  };
  const ok = checks.supabase_url && checks.supabase_anon_key && checks.supabase_service_role;
  return NextResponse.json({ ok, app: "customer-web", checks }, { status: ok ? 200 : 503 });
}
