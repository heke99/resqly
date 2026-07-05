import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceClient } from "@resqly/web-kit/server";
import { PORTAL_AUTH_COOKIE, PORTAL_REFRESH_COOKIE } from "../../../lib/constants";

/**
 * Exchange a browser-held session (from an invite / recovery link) for
 * HttpOnly session cookies. The access token is validated server-side before
 * any cookie is set.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : "";
  if (!accessToken) return NextResponse.json({ error: "Sessionen saknas." }, { status: 400 });

  const db = getServiceClient();
  if (!db) return NextResponse.json({ error: "Tjänsten är inte tillgänglig just nu." }, { status: 503 });
  const { data, error } = await db.auth.getUser(accessToken);
  if (error || !data.user) return NextResponse.json({ error: "Sessionen är ogiltig." }, { status: 401 });

  const secure = process.env.NODE_ENV === "production";
  const store = await cookies();
  const expiresIn = Number(body.expires_in);
  store.set(PORTAL_AUTH_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
  });
  if (refreshToken) {
    store.set(PORTAL_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return NextResponse.json({ ok: true });
}
