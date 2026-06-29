import { Card, EmptyState, PageHeader, StatCard, DataTable, Badge, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "./lib/tenant";
import { getPortalDashboardData } from "./lib/data";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const incidentColumns: Column<Row>[] = [
  { key: "case", header: "Case", render: (r) => <a href={`/cases/${String(r.id)}`}>{String(r.case_number ?? String(r.id).slice(0, 8))}</a> },
  { key: "type", header: "Type", render: (r) => String(r.type ?? "—").replaceAll("_", " ") },
  { key: "status", header: "Status", render: (r) => <Badge>{String(r.status ?? "—")}</Badge> },
  { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

const jobColumns: Column<Row>[] = [
  { key: "job", header: "Job", render: (r) => String(r.id ?? "").slice(0, 8) },
  { key: "status", header: "Status", render: (r) => <Badge>{String(r.status ?? "—")}</Badge> },
  { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "normal") },
  { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) {
    return (
      <div>
        <PageHeader title="Partner portal" />
        <EmptyState title="No tenant available" hint="A superadmin must create your tenant first, then your users." />
      </div>
    );
  }
  const data = await getPortalDashboardData(tenant.id);
  const open = data.incidents.filter((i) => !["closed", "cancelled", "rejected", "completed"].includes(String(i.status)));
  const awaitingBankid = data.incidents.filter((i) => String(i.status) === "awaiting_bankid");
  const moreInfo = data.incidents.filter((i) => String(i.status) === "more_info_required");
  const activeJobs = data.jobs.filter((j) => !["closed", "cancelled", "completed", "invoiced"].includes(String(j.status)));
  const manual = data.jobs.filter((j) => String(j.status) === "manual_review");
  const onDuty = data.drivers.filter((d) => ["on_duty", "on_call"].includes(String(d.duty_status)));
  const isInsurance = tenant.type === "insurance_company";

  return (
    <div>
      <PageHeader
        title={`${tenant.name} — Dashboard`}
        subtitle={`${tenant.type} • prefix ${tenant.case_number_prefix}`}
        actions={<a href={isInsurance ? "/cases" : "/jobs"}>{isInsurance ? "Review cases" : "Dispatch jobs"}</a>}
      />
      {isInsurance ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          <StatCard label="New/open cases" value={open.length} />
          <StatCard label="Awaiting BankID" value={awaitingBankid.length} />
          <StatCard label="More info required" value={moreInfo.length} />
          <StatCard label="Active towing" value={activeJobs.length} />
          <StatCard label="Manual review" value={manual.length} />
          <StatCard label="Webhooks" value={data.webhooks.length} />
          <StatCard label="API clients" value={data.apiClients.length} />
          <StatCard label="Total cases" value={data.incidents.length} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 }}>
          <StatCard label="New offers / jobs" value={activeJobs.length} />
          <StatCard label="Manual review" value={manual.length} />
          <StatCard label="Drivers on duty" value={onDuty.length} />
          <StatCard label="Tow vehicles" value={data.towVehicles.length} />
          <StatCard label="Completion reports missing" value={activeJobs.length} />
          <StatCard label="Invoice basis ready" value={data.jobs.filter((j) => String(j.status) === "completed").length} />
          <StatCard label="API clients" value={data.apiClients.length} />
          <StatCard label="Total jobs" value={data.jobs.length} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
        <DataTable columns={incidentColumns} rows={data.incidents.slice(0, 8)} empty="No cases yet" />
        <DataTable columns={jobColumns} rows={data.jobs.slice(0, 8)} empty="No tow jobs yet" />
      </div>

      <Card style={{ marginTop: 24 }}>
        <strong>{isInsurance ? "Insurance workflow" : "Towing workflow"}</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          {isInsurance
            ? "Review BankID status, damage claims, towing progress, SLA risk, photos and invoice basis from this portal."
            : "Manage dispatch, drivers, towing vehicles, completion reports and invoice basis from this portal."}
        </p>
      </Card>
    </div>
  );
}
