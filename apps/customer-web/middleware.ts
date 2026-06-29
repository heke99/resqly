import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const pathMatch = request.nextUrl.pathname.match(/^\/partner\/([^/]+)/);
  const querySlug = request.nextUrl.searchParams.get("partner") ?? request.nextUrl.searchParams.get("tenant");
  const slug = pathMatch?.[1] ?? querySlug;
  if (slug) headers.set("x-resqly-partner-slug", slug.toLowerCase());
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
