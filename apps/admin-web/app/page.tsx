import { Card, PageHeader, StatCard, DataTable, Badge, type Column } from "@resqly/web-kit";
import { getDashboardData, type TenantRow } from "./lib/data";

export const dynamic = "force-dynamic";

const tenantColumns: Column<TenantRow>[] = [
  { key: "name", header: "Tenant", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Type", render: (t) => <Badge>{t.type}</Badge> },
  { key: "slug", header: "Customer link", render: (t) => <code>/partner/{t.slug}</code> },
  { key: "prefix", header: "Prefix", render: (t) => t.case_number_prefix },
];

export default async function DashboardPage() {
  const data = await getDashboardData();
  const insurance = data.tenants.filter((t) => t.type === "insurance_company").length;
  const tow = data.tenants.filter((t) => t.type === "tow_company").length;

  return (
    <div>
      <PageHeader
        title="Resqly superadmin"
        subtitle="Onboard partners, monitor cases, audit access and keep the platform production-safe."
        actions={<a href="/tenants">Create partner</a>}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
        <StatCard label="Tenants" value={data.tenants.length} />
        <StatCard label="Insurance companies" value={insurance} />
        <StatCard label="Tow companies" value={tow} />
        <StatCard label="Open cases" value={data.openIncidentCount} />
        <StatCard label="All cases" value={data.incidentCount} />
        <StatCard label="Manual reviews" value={data.manualReviewCount} />
        <StatCard label="Webhook/API failures" value={data.webhookFailures} />
        <StatCard label="Customer app" value="app.resqly.se" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 0.75fr", gap: 24, marginTop: 24, alignItems: "start" }}>
        <DataTable columns={tenantColumns} rows={data.tenants.slice(0, 8)} empty="No partners yet" />
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Quick actions</h3>
            <p><a href="/tenants">Create insurance company or tow company</a></p>
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
