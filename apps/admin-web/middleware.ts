import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_AUTH_COOKIE, ADMIN_REFRESH_COOKIE } from "./app/lib/constants";

const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

interface RefreshedSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Server-side session refresh using the HttpOnly refresh cookie. */
async function refreshSession(refreshToken: string): Promise<RefreshedSession | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: anonKey },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<RefreshedSession>;
    if (!json.access_token || !json.refresh_token) return null;
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: Number.isFinite(json.expires_in) ? Number(json.expires_in) : 3600,
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("x-resqly-pathname", pathname);

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const accessToken = request.cookies.get(ADMIN_AUTH_COOKIE)?.value ?? null;
  if (accessToken) {
    return NextResponse.next({ request: { headers } });
  }

  const refreshToken = request.cookies.get(ADMIN_REFRESH_COOKIE)?.value ?? null;
  if (refreshToken) {
    const session = await refreshSession(refreshToken);
    if (session) {
      request.cookies.set(ADMIN_AUTH_COOKIE, session.access_token);
      headers.set("cookie", request.cookies.toString());
      const response = NextResponse.next({ request: { headers } });
      const secure = process.env.NODE_ENV === "production";
      response.cookies.set(ADMIN_AUTH_COOKIE, session.access_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: session.expires_in,
      });
      response.cookies.set(ADMIN_REFRESH_COOKIE, session.refresh_token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }
  }

  const loginUrl = new URL("/login", request.url);
  if (refreshToken) loginUrl.searchParams.set("error", "session_expired");
  const redirectResponse = NextResponse.redirect(loginUrl);
  redirectResponse.cookies.delete(ADMIN_AUTH_COOKIE);
  redirectResponse.cookies.delete(ADMIN_REFRESH_COOKIE);
  return redirectResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
