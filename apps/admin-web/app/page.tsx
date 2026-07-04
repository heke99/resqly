import { Card, PageHeader, StatCard, DataTable, Badge, KpiGrid, type Column } from "@resqly/web-kit";
import { getDashboardData, getPlatformStats, type TenantRow } from "./lib/data";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  insurance_company: "Försäkringsbolag",
  tow_company: "Bärgningsbolag",
  platform_internal: "Plattform",
};

const tenantColumns: Column<TenantRow>[] = [
  { key: "name", header: "Organisation", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Typ", render: (t) => <Badge>{TYPE_LABELS[t.type] ?? t.type}</Badge> },
  { key: "slug", header: "Kundlänk", render: (t) => <code>/partner/{t.slug}</code> },
  { key: "prefix", header: "Ärendeprefix", render: (t) => t.case_number_prefix },
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
        title="Intern kontroll"
        subtitle="Onboarda organisationer, följ ärenden och håll plattformen redo för drift."
        actions={<a href="/tenants">Skapa organisation</a>}
      />
      <KpiGrid>
        <StatCard label="Organisationer" value={n(s.total_tenants) || data.tenants.length} />
        <StatCard label="Försäkringsbolag" value={n(s.insurance_companies) || insurance} />
        <StatCard label="Bärgningsbolag" value={n(s.tow_companies) || tow} />
        <StatCard label="Aktiva förare" value={n(s.active_drivers)} />
        <StatCard label="Förare i tjänst" value={n(s.drivers_online)} />
        <StatCard label="Aktiva ärenden" value={n(s.active_cases) || data.openIncidentCount} />
        <StatCard label="Ärenden idag" value={n(s.cases_today)} />
        <StatCard label="Ärenden (7 dagar)" value={n(s.cases_7d)} />
        <StatCard label="Aktiva bärgningsuppdrag" value={n(s.active_tow_jobs)} />
        <StatCard label="Riskerar tidsgräns" value={n(s.sla_risks)} />
        <StatCard label="BankID-signeringar (7 dagar)" value={n(s.bankid_signatures_7d)} />
        <StatCard label="Integrationsfel" value={n(s.webhook_errors) || data.webhookFailures} />
        <StatCard label="Behöver hjälp" value={data.manualReviewCount} />
        <StatCard label="Fakturaunderlag" value={`${(n(s.revenue_minor) / 100).toLocaleString("sv-SE")} SEK`} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, marginTop: 24, alignItems: "start" }}>
        <DataTable columns={tenantColumns} rows={data.tenants.slice(0, 8)} empty="Inga organisationer ännu" />
        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Snabbåtgärder</h3>
            <p><a href="/tenants">Skapa försäkringsbolag eller bärgningsbolag</a></p>
            <p><a href="/agreements">Hantera avtal och fri bärgning</a></p>
            <p><a href="/operations">Se ärenden som behöver hjälp och integrationsfel</a></p>
            <p><a href="/audit">Öppna händelseloggen</a></p>
            <p><a href={process.env.NEXT_PUBLIC_CUSTOMER_WEB_URL ?? "https://app.resqly.se"}>Öppna kundappen</a></p>
            <p style={{ opacity: 0.72, marginBottom: 0 }}>
              Börja med ett försäkringsbolag: sätt varumärke, skapa första administratören och testa ett fordonsärende.
            </p>
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Senaste händelser</h3>
            {data.latestAudit.length === 0 ? <p style={{ opacity: 0.7 }}>Inga händelser ännu.</p> : null}
            {data.latestAudit.map((event) => (
              <div key={String(event.id)} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", padding: "10px 0" }}>
                <strong>{String(event.action ?? "händelse")}</strong> {String(event.entity_type ?? "")}
                <div style={{ opacity: 0.65, fontSize: 13 }}>{String(event.created_at ?? "")}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
