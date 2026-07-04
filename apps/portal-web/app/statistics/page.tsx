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

export default async function StatistikPage({
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
      <Field label="Från">
        <input type="date" name="from" defaultValue={from} />
      </Field>
      <Field label="Till">
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
        <PageHeader title="Statistik" subtitle="Tilldelning och fordons-/förarprestanda" />
        {filters}
        <KpiGrid>
          <StatCard label="Slutförda uppdrag" value={num(stats?.completed_jobs)} />
          <StatCard label="Accepterade uppdrag" value={num(stats?.accepted_jobs)} />
          <StatCard label="Missade uppdrag" value={num(stats?.missed_jobs)} />
          <StatCard label="Snitt-tid till accept" value={formatSeconds(stats?.avg_accept_seconds)} />
          <StatCard label="Snitt-tid till framme" value={formatSeconds(stats?.avg_arrival_seconds)} />
          <StatCard label="Inom / utanför tidsgräns" value={`${num(stats?.sla_hit)} / ${num(stats?.sla_miss)}`} />
          <StatCard label="Fakturaunderlag" value={formatMoneyMinor(stats?.revenue_minor)} />
          <StatCard label="Förare i tjänst" value={num(stats?.drivers_online)} />
        </KpiGrid>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
          <Card>
            <h3 style={{ marginTop: 0 }}>Uppdrag per status</h3>
            <Bars data={byStatus} />
          </Card>
          <Card>
            <h3 style={{ marginTop: 0 }}>Försäkring vs privat</h3>
            <Bars data={byPayer} />
          </Card>
        </div>
        <Card style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Uppdrag per förare</h3>
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
      <PageHeader title="Statistik" subtitle="Ärenden, bärgning och kostnadsanalys" />
      {filters}
      <KpiGrid>
        <StatCard label="Ärenden totalt" value={num(stats?.total_cases)} />
        <StatCard label="Avslutade" value={num(stats?.completed_cases)} />
        <StatCard label="Avbrutna" value={num(stats?.cancelled_cases)} />
        <StatCard label="Skadeärenden" value={num(stats?.damage_claims)} />
        <StatCard label="Riskerar tidsgräns" value={num(stats?.sla_risk)} />
        <StatCard label="Snitt ankomsttid" value={formatSeconds(stats?.avg_eta_seconds)} />
        <StatCard label="Snitt handläggningstid" value={formatSeconds(stats?.avg_resolution_seconds)} />
        <StatCard label="Kostnad (period)" value={formatMoneyMinor(stats?.total_cost_minor)} />
      </KpiGrid>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Ärenden per status</h3>
          <Bars data={countBy(incidents, "status")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Ärenden per typ</h3>
          <Bars data={countBy(incidents, "type")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Ärenden per problem</h3>
          <Bars data={countBy(incidents.filter((i) => i.problem_type), "problem_type")} />
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Bärgning per status</h3>
          <Bars data={countBy(jobs, "status")} />
        </Card>
      </div>
    </div>
  );
}
