import { DataTable, KpiGrid, PageHeader, StatCard, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getInsuranceDashboardStats, listInsuranceTowJobs } from "../lib/data";
import { NoTenant, WrongTenantType, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const ACTIVE = ["offered", "accepted", "driver_en_route", "driver_arrived", "vehicle_loaded", "transporting", "delivered"];

export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;

  const [stats, jobs] = await Promise.all([
    getInsuranceDashboardStats(tenant.id),
    listInsuranceTowJobs(tenant.id),
  ]);
  const now = Date.now();
  const atRisk = jobs.filter(
    (j) =>
      j.sla_deadline &&
      ACTIVE.includes(String(j.status)) &&
      Date.parse(String(j.sla_deadline)) < now,
  );

  const columns: Column<Row>[] = [
    { key: "job", header: "Job", render: (r) => String(r.id).slice(0, 8) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
    { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "normal") },
    { key: "deadline", header: "SLA deadline", render: (r) => String(r.sla_deadline ?? "—").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="SLA performance" subtitle="Service-level risk and response across your towing network" />
      <KpiGrid>
        <StatCard label="SLA risk (open)" value={num(stats?.sla_risk)} />
        <StatCard label="Active towing" value={num(stats?.active_towing)} />
        <StatCard label="Avg ETA" value={num(stats?.avg_eta_seconds) ? `${Math.round(num(stats?.avg_eta_seconds) / 60)} min` : "—"} />
        <StatCard label="Completed cases" value={num(stats?.completed_cases)} />
      </KpiGrid>
      <h3 style={{ marginTop: 24 }}>Jobs at SLA risk</h3>
      <DataTable columns={columns} rows={atRisk} empty="No jobs are currently breaching SLA" />
    </div>
  );
}
