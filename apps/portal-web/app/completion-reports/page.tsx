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
    { key: "job", header: "Uppdrag", render: (r) => <a href={`/jobs/${String(r.tow_job_id)}`}>{String(r.tow_job_id ?? "").slice(0, 8).toUpperCase()}</a> },
    { key: "work", header: "Utfört arbete", render: (r) => String(r.work_performed ?? "—") },
    { key: "picked", header: "Fordon hämtat", render: (r) => (r.vehicle_picked_up ? "Ja" : "Nej") },
    { key: "waiting", header: "Waiting (min)", render: (r) => String(r.waiting_minutes ?? 0) },
    { key: "failed", header: "Bomkörning", render: (r) => (r.failed_trip ? "Ja" : "Nej") },
    { key: "created", header: "Inskickad", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Utföranderapporter" subtitle="Utförandedetaljer inskickade av förare" />
      <DataTable columns={columns} rows={reports} empty="Inga utföranderapporter ännu" />
    </div>
  );
}
