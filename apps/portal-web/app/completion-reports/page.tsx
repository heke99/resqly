import { DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listCompletionReports } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function CompletionReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const reports = await listCompletionReports(tenant.id);
  const columns: Column<Row>[] = [
    { key: "job", header: "Job", render: (r) => String(r.tow_job_id ?? "").slice(0, 8) },
    { key: "work", header: "Work performed", render: (r) => String(r.work_performed ?? "—") },
    { key: "picked", header: "Picked up", render: (r) => (r.vehicle_picked_up ? "Yes" : "No") },
    { key: "waiting", header: "Waiting (min)", render: (r) => String(r.waiting_minutes ?? 0) },
    { key: "failed", header: "Failed trip", render: (r) => (r.failed_trip ? "Yes" : "No") },
    { key: "created", header: "Submitted", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Completion reports" subtitle="Driver-submitted job completion details" />
      <DataTable columns={columns} rows={reports} empty="No completion reports yet" />
    </div>
  );
}
