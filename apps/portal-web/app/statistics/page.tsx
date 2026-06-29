import { Bars, Card, Field, Filters, KpiGrid, PageHeader, StatCard } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import {
  countBy,
  getInsuranceDashboardStats,
  getTowCompanyDashboardStats,
  getDriverPerformance,
  listCompanyJobs,
  listIncidents,
  listInsuranceTowJobs,
} from "../lib/data";
import { NoTenant, formatMoneyMinor, formatSeconds, num } from "../lib/ui";

export const dynamic = "force-dynamic";

function dateFilter<T extends Record<string, unknown>>(rows: T[], from?: string, to?: string): T[] {
  if (!from && !to) return rows;
  const fromMs = from ? Date.parse(from) : -Infinity;
  const toMs = to ? Date.parse(to) + 86_400_000 : Infinity;
  return rows.filter((r) => {
    const t = Date.parse(String(r.created_at ?? ""));
    return Number.isFinite(t) ? t >= fromMs && t <= toMs : true;
  });
}

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  const isTow = tenant.type === "tow_company";

  const filters = (
    <Filters>
      <Field label="From">
        <input type="date" name="from" defaultValue={from} />
      </Field>
      <Field label="To">
        <input type="date" name="to" defaultValue={to} />
      </Field>
    </Filters>
  );

  if (isTow) {
    const [stats, jobsAll, drivers] = await Promise.all([
      getTowCompanyDashboardStats(tenant.id),
      listCompanyJobs(tenant.id),
      getDriverPerformance(tenant.id),
    ]);
    const jobs = dateFilter(jobsAll, from, to);
    const byStatus = countBy(jobs, "status");
    const byPayer = countBy(jobs, "payer_type");
    return (
      <div>
        <PageHeader title="Statistics" subtitle="Dispatch and fleet performance" />
        {filters}
        <KpiGrid>
          <StatCard label="Completed jobs" value={num(stats?.completed_jobs)} />
          <StatCard label="Accepted jobs" value={num(stats?.accepted_jobs)} />
          <StatCard label="Missed jobs" value={num(stats?.missed_jobs)} />
          <StatCard label="Avg accept time" value={formatSeconds(stats?.avg_accept_seconds)} />
          <StatCard label="Avg arrival time" value={formatSeconds(stats?.avg_arrival_seconds)} />
          <StatCard label="SLA hit / miss" value={`${num(stats?.sla_hit)} / ${num(stats?.sla_miss)}`} />
          <StatCard label="Invoice basis" value={formatMoneyMinor(stats?.revenue_minor)} />
          <StatCard label="Drivers online" value={num(stats?.drivers_online)} />
        </KpiGrid>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Jobs by status</h3>
            <Bars data={byStatus} />
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Insurance vs direct</h3>
            <Bars data={byPayer} />
          </Card>
        </div>
        <Card style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Jobs per driver</h3>
          <Bars
            data={drivers.map((d) => ({ label: String(d.full_name ?? d.driver_id), value: num(d.jobs_completed) }))}
          />
        </Card>
      </div>
    );
  }

  const [stats, incidentsAll, jobsAll] = await Promise.all([
    getInsuranceDashboardStats(tenant.id),
    listIncidents(tenant.id),
    listInsuranceTowJobs(tenant.id),
  ]);
  const incidents = dateFilter(incidentsAll, from, to);
  const jobs = dateFilter(jobsAll, from, to);
  return (
    <div>
      <PageHeader title="Statistics" subtitle="Cases, towing and cost analysis" />
      {filters}
      <KpiGrid>
        <StatCard label="Total cases" value={num(stats?.total_cases)} />
        <StatCard label="Completed" value={num(stats?.completed_cases)} />
        <StatCard label="Cancelled" value={num(stats?.cancelled_cases)} />
        <StatCard label="Damage claims" value={num(stats?.damage_claims)} />
        <StatCard label="SLA risk" value={num(stats?.sla_risk)} />
        <StatCard label="Avg ETA" value={formatSeconds(stats?.avg_eta_seconds)} />
        <StatCard label="Avg resolution" value={formatSeconds(stats?.avg_resolution_seconds)} />
        <StatCard label="Cost (period)" value={formatMoneyMinor(stats?.total_cost_minor)} />
      </KpiGrid>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Cases by status</h3>
          <Bars data={countBy(incidents, "status")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Cases by type</h3>
          <Bars data={countBy(incidents, "type")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Cases by problem</h3>
          <Bars data={countBy(incidents.filter((i) => i.problem_type), "problem_type")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Towing by status</h3>
          <Bars data={countBy(jobs, "status")} />
        </Card>
      </div>
    </div>
  );
}
