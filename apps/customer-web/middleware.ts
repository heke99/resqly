import { NextResponse, type NextRequest } from "next/server";

const SESSION_MARKER_COOKIE = "resqly_customer_session";
const PROTECTED_PREFIXES = ["/cases", "/vehicles", "/insurances", "/profile"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const pathMatch = request.nextUrl.pathname.match(/^\/partner\/([^/]+)/);
  const querySlug = request.nextUrl.searchParams.get("partner") ?? request.nextUrl.searchParams.get("tenant");
  const slug = pathMatch?.[1] ?? querySlug;
  if (slug) headers.set("x-resqly-partner-slug", slug.toLowerCase());

  // Early redirect for logged-out visitors on protected pages. The marker
  // cookie is set by the client session listener and holds no secret; data
  // access is still protected by RLS and per-request auth checks.
  const pathname = request.nextUrl.pathname;
  if (isProtected(pathname) && !request.cookies.get(SESSION_MARKER_COOKIE)?.value) {
    const loginUrl = new URL("/login", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    if (next !== "/") loginUrl.searchParams.set("next", next);
    if (slug) loginUrl.searchParams.set("partner", slug.toLowerCase());
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
