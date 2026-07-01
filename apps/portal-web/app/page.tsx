import {
  Card,
  DataTable,
  KpiGrid,
  PageHeader,
  StatCard,
  StatusChip,
  type Column,
} from "@resqly/web-kit";
import { getActiveTenant } from "./lib/tenant";
import {
  getInsuranceDashboardStats,
  getTowCompanyDashboardStats,
  listCompanyJobs,
  listCompanyOffers,
  listIncidents,
  listInsuranceTowJobs,
} from "./lib/data";
import { NoTenant, formatMoneyMinor, formatSeconds, num } from "./lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const incidentColumns: Column<Row>[] = [
  {
    key: "case",
    header: "Ärende",
    render: (r) => (
      <a href={`/cases/${String(r.id)}`}>{String(r.case_number ?? String(r.id).slice(0, 8))}</a>
    ),
  },
  { key: "type", header: "Typ", render: (r) => String(r.type ?? "—").replaceAll("_", " ") },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
  { key: "created", header: "Skapad", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

const jobColumns: Column<Row>[] = [
  { key: "job", header: "Uppdrag", render: (r) => String(r.id ?? "").slice(0, 8) },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
  { key: "priority", header: "Prioritet", render: (r) => String(r.priority ?? "normal") },
  { key: "created", header: "Skapad", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;

  if (tenant.type === "tow_company") {
    const [stats, jobs, offers] = await Promise.all([
      getTowCompanyDashboardStats(tenant.id),
      listCompanyJobs(tenant.id),
      listCompanyOffers(tenant.id),
    ]);
    const s = stats ?? {};
    const activeJobs = jobs.filter(
      (j) => !["closed", "cancelled", "completed", "invoiced", "manual_review"].includes(String(j.status)),
    );
    return (
      <div>
        <PageHeader
          title={`${tenant.name} — uppdrag och fordonsflotta`}
          subtitle="Livevy över erbjudanden, uppdrag, förare och intäkter"
          actions={<a href="/offers">Visa nya uppdrag</a>}
        />
        <KpiGrid>
          <StatCard label="Nya uppdrag" value={num(s.new_offers)} />
          <StatCard label="Aktiva uppdrag" value={num(s.active_jobs)} />
          <StatCard label="Förare online" value={num(s.drivers_online)} />
          <StatCard label="Tillgängliga bilar" value={num(s.vehicles_available)} />
          <StatCard label="Accepterade uppdrag" value={num(s.accepted_jobs)} />
          <StatCard label="Nekade uppdrag" value={num(s.rejected_jobs)} />
          <StatCard label="Missade uppdrag" value={num(s.missed_jobs)} />
          <StatCard label="Slutförda uppdrag" value={num(s.completed_jobs)} />
          <StatCard label="Snitt accepttid" value={formatSeconds(s.avg_accept_seconds)} />
          <StatCard label="Snitt ankomsttid" value={formatSeconds(s.avg_arrival_seconds)} />
          <StatCard label="SLA hit / miss" value={`${num(s.sla_hit)} / ${num(s.sla_miss)}`} />
          <StatCard label="Fakturaunderlag" value={formatMoneyMinor(s.revenue_minor)} />
        </KpiGrid>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
          <div>
            <h3>Aktiva uppdrag</h3>
            <DataTable columns={jobColumns} rows={activeJobs.slice(0, 8)} empty="Inga aktiva uppdrag" />
          </div>
          <div>
            <h3>Senaste uppdrag</h3>
            <DataTable
              columns={[
                { key: "job", header: "Uppdrag", render: (r) => String(r.tow_job_id ?? "").slice(0, 8) },
                { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
                { key: "expires", header: "Går ut", render: (r) => String(r.expires_at ?? "").slice(11, 16) },
              ]}
              rows={offers.slice(0, 8)}
              empty="Inga erbjudanden ännu"
            />
          </div>
        </div>

        <Card style={{ marginTop: 24 }}>
          <strong>Nästa steg</strong>
          <p style={{ opacity: 0.72, marginBottom: 0 }}>
            Svara snabbt på nya uppdrag för att skydda acceptansgraden. Håll förare online och bilar tillgängliga för uppdrag från försäkringspartners och fri bärgning.
          </p>
        </Card>
      </div>
    );
  }

  // Insurance company (default).
  const [stats, incidents, jobs] = await Promise.all([
    getInsuranceDashboardStats(tenant.id),
    listIncidents(tenant.id),
    listInsuranceTowJobs(tenant.id),
  ]);
  const s = stats ?? {};
  return (
    <div>
      <PageHeader
        title={`${tenant.name} — ärenden och skadehantering`}
        subtitle="Ärenden, bärgning, SLA och partnerprestanda i överblick"
        actions={<a href="/cases">Granska ärenden</a>}
      />
      <KpiGrid>
        <StatCard label="Nya ärenden" value={num(s.new_cases)} />
        <StatCard label="Aktiv bärgning" value={num(s.active_towing)} />
        <StatCard label="Skadeärenden" value={num(s.damage_claims)} />
        <StatCard label="Väntar på BankID" value={num(s.awaiting_bankid)} />
        <StatCard label="Väntar på handläggare" value={num(s.awaiting_handler)} />
        <StatCard label="SLA-risk" value={num(s.sla_risk)} />
        <StatCard label="Snitt-ETA" value={formatSeconds(s.avg_eta_seconds)} />
        <StatCard label="Snitt handläggningstid" value={formatSeconds(s.avg_resolution_seconds)} />
        <StatCard label="Slutförda ärenden" value={num(s.completed_cases)} />
        <StatCard label="Avbrutna ärenden" value={num(s.cancelled_cases)} />
        <StatCard label="Kostnad period" value={formatMoneyMinor(s.total_cost_minor)} />
        <StatCard label="Webhook-fel" value={num(s.webhook_errors)} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
        <div>
          <h3>Senaste ärenden</h3>
          <DataTable columns={incidentColumns} rows={incidents.slice(0, 8)} empty="Inga ärenden ännu" />
        </div>
        <div>
          <h3>Aktiv bärgning</h3>
          <DataTable columns={jobColumns} rows={jobs.slice(0, 8)} empty="Inga bärgningsuppdrag ännu" />
        </div>
      </div>

      <Card style={{ marginTop: 24 }}>
        <strong>Nästa steg</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          Prioritera ärenden som väntar på handläggare och alla SLA-risker. Granska skadeärenden och följ bärgarpartnernas prestanda via Statistik och Bärgarpartners.
        </p>
      </Card>
    </div>
  );
}
