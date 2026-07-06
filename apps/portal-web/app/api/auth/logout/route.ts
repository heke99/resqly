import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceClient } from "@resqly/web-kit/server";
import { PORTAL_AUTH_COOKIE, PORTAL_REFRESH_COOKIE, PORTAL_TENANT_COOKIE } from "../../../lib/constants";

export async function POST() {
  const store = await cookies();
  const token = store.get(PORTAL_AUTH_COOKIE)?.value;
  // Best-effort server-side revocation of the refresh token family.
  if (token) {
    const db = getServiceClient();
    await db?.auth.admin.signOut(token).catch(() => undefined);
  }
  store.delete(PORTAL_AUTH_COOKIE);
  store.delete(PORTAL_REFRESH_COOKIE);
  store.delete(PORTAL_TENANT_COOKIE);
  return NextResponse.json({ ok: true });
}
