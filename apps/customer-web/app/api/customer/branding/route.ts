import { NextResponse } from "next/server";
import { getServiceClient } from "@resqly/web-kit/server";

/**
 * Public white-label lookup used by the customer mobile app. Returns only
 * public-safe branding (name, colors, logo, support contact) for an
 * organization identified by id or public link name. Never any settings,
 * keys or internal configuration.
 */
export async function GET(request: Request) {
  const db = getServiceClient();
  if (!db) {
    return NextResponse.json({ error: "Tjänsten är tillfälligt otillgänglig." }, { status: 503 });
  }
  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenant");
  const partnerParam = url.searchParams.get("partner");

  let tenantId: string | null = null;
  if (tenantParam && /^[0-9a-f-]{36}$/i.test(tenantParam)) {
    tenantId = tenantParam;
  } else if (partnerParam) {
    const { data } = await db
      .from("tenants" as never)
      .select("id")
      .eq("slug", partnerParam.toLowerCase())
      .eq("status", "active")
      .maybeSingle();
    tenantId = (data as { id?: string } | null)?.id ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ branding: null });
  }

  const [tokens, branding, tenant] = await Promise.all([
    db.from("tenant_theme_tokens" as never).select("color_primary, color_secondary, color_background, color_surface, color_text, color_on_primary").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenant_branding" as never).select("product_name, support_phone, support_email, logo_url").eq("tenant_id", tenantId).maybeSingle(),
    db.from("tenants" as never).select("name, slug, status").eq("id", tenantId).maybeSingle(),
  ]);
  const t = tenant.data as { name?: string; slug?: string; status?: string } | null;
  if (!t || t.status !== "active") {
    return NextResponse.json({ branding: null });
  }
  const b = (branding.data as { product_name?: string; support_phone?: string; support_email?: string; logo_url?: string } | null) ?? {};

  return NextResponse.json({
    branding: {
      tenant_id: tenantId,
      slug: t.slug ?? null,
      product_name: b.product_name ?? t.name ?? "Resqly",
      support_phone: b.support_phone ?? null,
      support_email: b.support_email ?? null,
      logo_url: b.logo_url ?? null,
      tokens: (tokens.data as Record<string, string> | null) ?? {},
    },
  });
}
