import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServiceClient } from "@resqly/web-kit/server";
import { ADMIN_AUTH_COOKIE, ADMIN_REFRESH_COOKIE } from "../../../lib/constants";

export async function POST() {
  const store = await cookies();
  const token = store.get(ADMIN_AUTH_COOKIE)?.value;
  // Best-effort server-side revocation of the refresh token family.
  if (token) {
    const db = getServiceClient();
    await db?.auth.admin.signOut(token).catch(() => undefined);
  }
  store.delete(ADMIN_AUTH_COOKIE);
  store.delete(ADMIN_REFRESH_COOKIE);
  return NextResponse.json({ ok: true });
}
