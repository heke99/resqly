import { requirePlatformAdmin } from "./auth";

export interface TenantRow {
  id: string;
  type: string;
  name: string;
  slug: string;
  status: string;
  case_number_prefix: string;
  created_at: string;
}

export interface TenantDetail extends TenantRow {
  branding: Record<string, unknown> | null;
  theme: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  flags: Record<string, unknown> | null;
  legal: Record<string, unknown> | null;
  domains: Array<Record<string, unknown>>;
  admins: Array<Record<string, unknown>>;
}

export interface AdminDashboardData {
  tenants: TenantRow[];
  incidentCount: number;
  openIncidentCount: number;
  manualReviewCount: number;
  webhookFailures: number;
  latestAudit: Array<Record<string, unknown>>;
}

export async function listTenants(): Promise<TenantRow[]> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("tenants" as never)
    .select("*")
    .order("created_at", { ascending: false });
  return (data as TenantRow[] | null) ?? [];
}

export async function getTenant(id: string): Promise<TenantDetail | null> {
  const { db } = await requirePlatformAdmin();
  const { data: tenant } = await db.from("tenants" as never).select("*").eq("id", id).maybeSingle();
  if (!tenant) return null;

  const [branding, theme, settings, flags, legal, domains, users] = await Promise.all([
    db.from("tenant_branding" as never).select("*").eq("tenant_id", id).maybeSingle(),
    db.from("tenant_theme_tokens" as never).select("*").eq("tenant_id", id).maybeSingle(),
    db.from("tenant_settings" as never).select("*").eq("tenant_id", id).maybeSingle(),
    db.from("tenant_feature_flags" as never).select("*").eq("tenant_id", id).maybeSingle(),
    db.from("tenant_legal_texts" as never).select("*").eq("tenant_id", id).eq("locale", "sv-SE").maybeSingle(),
    db.from("tenant_domains" as never).select("*").eq("tenant_id", id).order("created_at", { ascending: false }),
    db
      .from("tenant_users" as never)
      .select("id, status, created_at, user_id")
      .eq("tenant_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const memberships = (users.data as Array<Record<string, unknown>> | null) ?? [];
  const userIds = memberships.map((u) => String(u.user_id)).filter(Boolean);
  const [profiles, roles] = userIds.length > 0
    ? await Promise.all([
        db.from("user_profiles" as never).select("id, email, full_name").in("id", userIds),
        db.from("user_roles" as never).select("user_id, role_key").eq("tenant_id", id).in("user_id", userIds),
      ])
    : [{ data: [] }, { data: [] }];
  const profileById = new Map(((profiles.data as Array<Record<string, unknown>> | null) ?? []).map((x) => [String(x.id), x]));
  const rolesByUser = new Map<string, string[]>();
  for (const role of (roles.data as Array<Record<string, unknown>> | null) ?? []) {
    const userId = String(role.user_id);
    const list = rolesByUser.get(userId) ?? [];
    list.push(String(role.role_key));
    rolesByUser.set(userId, list);
  }
  const admins = memberships.map((membership) => ({
    ...membership,
    profile: profileById.get(String(membership.user_id)) ?? null,
    roles: rolesByUser.get(String(membership.user_id)) ?? [],
  }));

  return {
    ...(tenant as TenantRow),
    branding: (branding.data as Record<string, unknown> | null) ?? null,
    theme: (theme.data as Record<string, unknown> | null) ?? null,
    settings: (settings.data as Record<string, unknown> | null) ?? null,
    flags: (flags.data as Record<string, unknown> | null) ?? null,
    legal: (legal.data as Record<string, unknown> | null) ?? null,
    domains: (domains.data as Array<Record<string, unknown>> | null) ?? [],
    admins,
  };
}

export async function listAuditLogs(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("audit_logs" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function getPlatformStats(): Promise<Record<string, unknown> | null> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db.from("superadmin_platform_stats" as never).select("*").maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

export interface CompanyOption {
  id: string;
  name: string;
  tenant_id: string;
}

export async function listTowCompanies(): Promise<CompanyOption[]> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db.from("tow_companies" as never).select("id, name, tenant_id").order("name");
  return (data as CompanyOption[] | null) ?? [];
}

export async function listInsuranceTenantOptions(): Promise<Array<{ id: string; name: string }>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("tenants" as never)
    .select("id, name")
    .eq("type", "insurance_company")
    .order("name");
  return (data as Array<{ id: string; name: string }> | null) ?? [];
}

export async function listAllAgreements(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("tow_company_insurance_agreements" as never)
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function listAllMarketplaceSettings(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db.from("tow_company_marketplace_settings" as never).select("*");
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

export async function getDashboardData(): Promise<AdminDashboardData> {
  const { db } = await requirePlatformAdmin();
  const tenants = await listTenants();
  const [incidents, manual, webhookFailures, latestAudit] = await Promise.all([
    db.from("incidents" as never).select("id, status", { count: "exact", head: false }).limit(500),
    db.from("manual_reviews" as never).select("id", { count: "exact", head: true }),
    db.from("webhook_deliveries" as never).select("id", { count: "exact", head: true }).neq("status", "succeeded"),
    db.from("audit_logs" as never).select("*").order("created_at", { ascending: false }).limit(8),
  ]);
  const incidentRows = (incidents.data as Array<{ id: string; status: string }> | null) ?? [];
  return {
    tenants,
    incidentCount: incidents.count ?? incidentRows.length,
    openIncidentCount: incidentRows.filter((i) => !["closed", "cancelled", "rejected"].includes(i.status)).length,
    manualReviewCount: manual.count ?? 0,
    webhookFailures: webhookFailures.count ?? 0,
    latestAudit: (latestAudit.data as Array<Record<string, unknown>> | null) ?? [],
  };
}

export async function listInsurerReadiness(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("insurer_production_readiness" as never)
    .select("*")
    .order("insurer_name", { ascending: true });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}
