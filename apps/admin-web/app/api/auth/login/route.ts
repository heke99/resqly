import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAnonClient } from "@resqly/database";
import { RateLimiter } from "@resqly/utils";
import { ADMIN_AUTH_COOKIE, ADMIN_REFRESH_COOKIE } from "../../../lib/constants";

// Sign-in happens fully server-side so the session tokens can be stored in
// HttpOnly cookies (never readable from browser JavaScript).

const loginLimiter = new RateLimiter(10, 60_000);

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Inloggningen är inte tillgänglig just nu." }, { status: 503 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!loginLimiter.check(`admin-login:${ip}`).allowed) {
    return NextResponse.json({ error: "För många inloggningsförsök. Vänta en stund och försök igen." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Ange e-post och lösenord." }, { status: 400 });
  }

  const supabase = createAnonClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return NextResponse.json({ error: "Fel e-post eller lösenord. Försök igen." }, { status: 401 });
  }

  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  store.set(ADMIN_AUTH_COOKIE, data.session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: data.session.expires_in && Number.isFinite(data.session.expires_in) ? data.session.expires_in : 3600,
  });
  if (data.session.refresh_token) {
    store.set(ADMIN_REFRESH_COOKIE, data.session.refresh_token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return NextResponse.json({ ok: true });
}
