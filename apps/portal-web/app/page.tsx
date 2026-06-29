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
    header: "Case",
    render: (r) => (
      <a href={`/cases/${String(r.id)}`}>{String(r.case_number ?? String(r.id).slice(0, 8))}</a>
    ),
  },
  { key: "type", header: "Type", render: (r) => String(r.type ?? "—").replaceAll("_", " ") },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
  { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

const jobColumns: Column<Row>[] = [
  { key: "job", header: "Job", render: (r) => String(r.id ?? "").slice(0, 8) },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
  { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "normal") },
  { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
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
          title={`${tenant.name} — Dispatch & fleet control`}
          subtitle="Live view of offers, jobs, drivers and revenue"
          actions={<a href="/offers">View new offers</a>}
        />
        <KpiGrid>
          <StatCard label="New offers" value={num(s.new_offers)} />
          <StatCard label="Active jobs" value={num(s.active_jobs)} />
          <StatCard label="Drivers online" value={num(s.drivers_online)} />
          <StatCard label="Available vehicles" value={num(s.vehicles_available)} />
          <StatCard label="Accepted jobs" value={num(s.accepted_jobs)} />
          <StatCard label="Rejected jobs" value={num(s.rejected_jobs)} />
          <StatCard label="Missed jobs" value={num(s.missed_jobs)} />
          <StatCard label="Completed jobs" value={num(s.completed_jobs)} />
          <StatCard label="Avg accept time" value={formatSeconds(s.avg_accept_seconds)} />
          <StatCard label="Avg arrival time" value={formatSeconds(s.avg_arrival_seconds)} />
          <StatCard label="SLA hit / miss" value={`${num(s.sla_hit)} / ${num(s.sla_miss)}`} />
          <StatCard label="Invoice basis" value={formatMoneyMinor(s.revenue_minor)} />
        </KpiGrid>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
          <div>
            <h3>Active jobs</h3>
            <DataTable columns={jobColumns} rows={activeJobs.slice(0, 8)} empty="No active jobs" />
          </div>
          <div>
            <h3>Latest offers</h3>
            <DataTable
              columns={[
                { key: "job", header: "Job", render: (r) => String(r.tow_job_id ?? "").slice(0, 8) },
                { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
                { key: "expires", header: "Expires", render: (r) => String(r.expires_at ?? "").slice(11, 16) },
              ]}
              rows={offers.slice(0, 8)}
              empty="No offers yet"
            />
          </div>
        </div>

        <Card style={{ marginTop: 24 }}>
          <strong>Next actions</strong>
          <p style={{ opacity: 0.72, marginBottom: 0 }}>
            Respond to new offers quickly to protect your accept rate. Keep drivers online and vehicles available to
            receive more dispatch offers from your insurance partners and the direct marketplace.
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
        title={`${tenant.name} — Operations & claims control`}
        subtitle="Cases, towing, SLA and partner performance at a glance"
        actions={<a href="/cases">Review cases</a>}
      />
      <KpiGrid>
        <StatCard label="New cases" value={num(s.new_cases)} />
        <StatCard label="Active towing" value={num(s.active_towing)} />
        <StatCard label="Damage claims" value={num(s.damage_claims)} />
        <StatCard label="Awaiting BankID" value={num(s.awaiting_bankid)} />
        <StatCard label="Awaiting handler" value={num(s.awaiting_handler)} />
        <StatCard label="SLA risk" value={num(s.sla_risk)} />
        <StatCard label="Avg ETA" value={formatSeconds(s.avg_eta_seconds)} />
        <StatCard label="Avg resolution" value={formatSeconds(s.avg_resolution_seconds)} />
        <StatCard label="Completed cases" value={num(s.completed_cases)} />
        <StatCard label="Cancelled cases" value={num(s.cancelled_cases)} />
        <StatCard label="Cost (period)" value={formatMoneyMinor(s.total_cost_minor)} />
        <StatCard label="Webhook errors" value={num(s.webhook_errors)} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
        <div>
          <h3>Recent cases</h3>
          <DataTable columns={incidentColumns} rows={incidents.slice(0, 8)} empty="No cases yet" />
        </div>
        <div>
          <h3>Active towing</h3>
          <DataTable columns={jobColumns} rows={jobs.slice(0, 8)} empty="No tow jobs yet" />
        </div>
      </div>

      <Card style={{ marginTop: 24 }}>
        <strong>Next actions</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          Prioritise cases awaiting a handler and any SLA risks. Review damage claims and monitor your tow partners&apos;
          performance from the Statistics and Tow partners views.
        </p>
      </Card>
    </div>
  );
}
