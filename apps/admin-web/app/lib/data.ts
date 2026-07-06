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

type Row = Record<string, unknown>;

/** Support tool: find cases by case number, registration number or UUID. */
export async function searchCases(q: string): Promise<Row[]> {
  const { db } = await requirePlatformAdmin();
  const term = q.trim();
  if (!term) {
    const { data } = await db
      .from("incidents" as never)
      .select("id, case_number, type, status, tenant_id, created_at, customer_user_id")
      .order("created_at", { ascending: false })
      .limit(25);
    return (data as Row[] | null) ?? [];
  }
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);
  if (isUuid) {
    const { data } = await db
      .from("incidents" as never)
      .select("id, case_number, type, status, tenant_id, created_at, customer_user_id")
      .eq("id", term)
      .limit(5);
    return (data as Row[] | null) ?? [];
  }
  const { data } = await db
    .from("incidents" as never)
    .select("id, case_number, type, status, tenant_id, created_at, customer_user_id")
    .ilike("case_number", `%${term}%`)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data as Row[] | null) ?? [];
}

export interface AdminCaseDetail {
  incident: Row;
  tenantName: string | null;
  locations: Row[];
  evidenceCount: number;
  consents: Row[];
  jobs: Row[];
  offers: Row[];
  timeline: Array<{ at: string; kind: string; to_status: string; reason: string | null }>;
  manualReviews: Row[];
}

/** Full support view of a case: timeline, dispatch, offers, consents. */
export async function getAdminCase(id: string): Promise<AdminCaseDetail | null> {
  const { db } = await requirePlatformAdmin();
  const { data: incident } = await db.from("incidents" as never).select("*").eq("id", id).maybeSingle();
  if (!incident) return null;
  const inc = incident as Row;

  const [tenantRes, locations, evidence, consents, jobs, incidentEvents, reviews] = await Promise.all([
    db.from("tenants" as never).select("name").eq("id", String(inc.tenant_id)).maybeSingle(),
    db.from("incident_locations" as never).select("kind, address, lat, lng, created_at").eq("incident_id", id).order("created_at"),
    db.from("incident_evidence" as never).select("id").eq("incident_id", id),
    db
      .from("customer_consent_acceptances" as never)
      .select("consent_kind, accepted_at, legal_version_id, metadata")
      .eq("incident_id", id)
      .order("accepted_at"),
    db.from("tow_jobs" as never).select("*").eq("incident_id", id).order("created_at", { ascending: false }),
    db.from("incident_status_events" as never).select("created_at, to_status, reason").eq("incident_id", id).order("created_at"),
    db.from("manual_reviews" as never).select("*").eq("incident_id", id).order("created_at", { ascending: false }),
  ]);

  const jobRows = (jobs.data as Row[] | null) ?? [];
  const jobIds = jobRows.map((j) => String(j.id));
  let offers: Row[] = [];
  let towEvents: Array<{ created_at: string; to_status: string; reason: string | null }> = [];
  if (jobIds.length > 0) {
    const [offersRes, towEventsRes] = await Promise.all([
      db
        .from("tow_job_offers" as never)
        .select("tow_job_id, driver_id, tow_company_id, status, rank, expires_at, push_status, push_error, created_at")
        .in("tow_job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("tow_job_status_events" as never)
        .select("created_at, to_status, reason")
        .in("tow_job_id", jobIds)
        .order("created_at"),
    ]);
    offers = (offersRes.data as Row[] | null) ?? [];
    towEvents = (towEventsRes.data as typeof towEvents | null) ?? [];
  }

  const timeline = [
    ...(((incidentEvents.data as Array<{ created_at: string; to_status: string; reason: string | null }> | null) ?? []).map(
      (e) => ({ at: e.created_at, kind: "incident", to_status: e.to_status, reason: e.reason ?? null }),
    )),
    ...towEvents.map((e) => ({ at: e.created_at, kind: "tow", to_status: e.to_status, reason: e.reason ?? null })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return {
    incident: inc,
    tenantName: (tenantRes.data as { name?: string } | null)?.name ?? null,
    locations: (locations.data as Row[] | null) ?? [],
    evidenceCount: ((evidence.data as Row[] | null) ?? []).length,
    consents: (consents.data as Row[] | null) ?? [],
    jobs: jobRows,
    offers,
    timeline,
    manualReviews: (reviews.data as Row[] | null) ?? [],
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

export async function listTowReadiness(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("tow_company_production_readiness" as never)
    .select("*")
    .order("tow_company_name", { ascending: true });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

/** Cases/jobs that are stuck in manual help and waiting for an operator. */
export async function listManualHelpCases(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("manual_reviews" as never)
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

/** Failed/skipped operational notifications (SMS fallback etc). */
export async function listNotificationFailures(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("operational_notification_queue" as never)
    .select("*")
    .in("status", ["failed", "skipped"] as never)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

/** Failed offer pushes still pending on their offers. */
export async function listPushFailures(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("tow_job_offers" as never)
    .select("id, tow_job_id, driver_id, status, push_status, push_attempts, push_error, updated_at")
    .eq("push_status", "failed")
    .order("updated_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

/** Integration deliveries that failed or exhausted their retries. */
export async function listIntegrationFailures(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("webhook_deliveries" as never)
    .select("id, tenant_id, event, status, attempts, last_error, next_attempt_at, created_at")
    .in("status", ["failed", "exhausted"] as never)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Array<Record<string, unknown>> | null) ?? [];
}

/** Agreement × tow vehicle approval matrix across all insurers. */
export async function listAgreementVehicleMatrixAll(): Promise<Array<Record<string, unknown>>> {
  const { db } = await requirePlatformAdmin();
  const { data } = await db
    .from("insurer_agreement_vehicle_matrix" as never)
    .select("*")
    .order("tow_company_name", { ascending: true });
  return (data as Array<Record<string, unknown>> | null) ?? [];
}
