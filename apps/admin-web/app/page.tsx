import { Card, PageHeader, StatCard, DataTable, Badge, KpiGrid, type Column } from "@resqly/web-kit";
import { getDashboardData, getPlatformStats, type TenantRow } from "./lib/data";

export const dynamic = "force-dynamic";

const tenantColumns: Column<TenantRow>[] = [
  { key: "name", header: "Tenant", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Type", render: (t) => <Badge>{t.type}</Badge> },
  { key: "slug", header: "Customer link", render: (t) => <code>/partner/{t.slug}</code> },
  { key: "prefix", header: "Prefix", render: (t) => t.case_number_prefix },
];

function n(v: unknown): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export default async function DashboardPage() {
  const [data, stats] = await Promise.all([getDashboardData(), getPlatformStats()]);
  const s = stats ?? {};
  const insurance = data.tenants.filter((t) => t.type === "insurance_company").length;
  const tow = data.tenants.filter((t) => t.type === "tow_company").length;

  return (
    <div>
      <PageHeader
        title="Resqly superadmin"
        subtitle="Onboard partners, monitor cases, audit access and keep the platform production-safe."
        actions={<a href="/tenants">Create partner</a>}
      />
      <KpiGrid>
        <StatCard label="Total tenants" value={n(s.total_tenants) || data.tenants.length} />
        <StatCard label="Insurance companies" value={n(s.insurance_companies) || insurance} />
        <StatCard label="Tow companies" value={n(s.tow_companies) || tow} />
        <StatCard label="Active drivers" value={n(s.active_drivers)} />
        <StatCard label="Drivers online" value={n(s.drivers_online)} />
        <StatCard label="Active cases" value={n(s.active_cases) || data.openIncidentCount} />
        <StatCard label="Cases today" value={n(s.cases_today)} />
        <StatCard label="Cases (7d)" value={n(s.cases_7d)} />
        <StatCard label="Active tow jobs" value={n(s.active_tow_jobs)} />
        <StatCard label="SLA risks" value={n(s.sla_risks)} />
        <StatCard label="BankID signatures (7d)" value={n(s.bankid_signatures_7d)} />
        <StatCard label="API/webhook errors" value={n(s.webhook_errors) || data.webhookFailures} />
        <StatCard label="Manual reviews" value={data.manualReviewCount} />
        <StatCard label="Revenue basis" value={`${(n(s.revenue_minor) / 100).toLocaleString("sv-SE")} SEK`} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 24, marginTop: 24, alignItems: "start" }}>
        <DataTable columns={tenantColumns} rows={data.tenants.slice(0, 8)} empty="No partners yet" />
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Quick actions</h3>
            <p><a href="/tenants">Create insurance company or tow company</a></p>
            <p><a href="/agreements">Configure agreements & marketplace</a></p>
            <p><a href="/audit">Open audit log</a></p>
            <p><a href={process.env.NEXT_PUBLIC_CUSTOMER_WEB_URL ?? "https://app.resqly.se"}>Open customer app</a></p>
            <p style={{ opacity: 0.72, marginBottom: 0 }}>
              Start with one insurance tenant, set branding, create the first portal admin and test a vehicle-based case.
            </p>
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Latest audit events</h3>
            {data.latestAudit.length === 0 ? <p style={{ opacity: 0.7 }}>No audit events yet.</p> : null}
            {data.latestAudit.map((event) => (
              <div key={String(event.id)} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "10px 0" }}>
                <strong>{String(event.action ?? "event")}</strong> {String(event.entity_type ?? "")}
                <div style={{ opacity: 0.65, fontSize: 13 }}>{String(event.created_at ?? "")}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
