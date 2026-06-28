import { Card, DataTable, PageHeader, type Column } from "@roadside/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listTowJobs } from "../lib/data";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: "id", header: "Job", render: (r) => String(r.id).slice(0, 8) },
  { key: "status", header: "Status", render: (r) => String(r.status ?? "") },
  { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "") },
  { key: "payer", header: "Payer", render: (r) => String(r.payer_type ?? "") },
  { key: "driver", header: "Driver", render: (r) => String(r.driver_id ?? "-") },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const jobs = tenant ? await listTowJobs(tenant.id) : [];
  return (
    <div>
      <PageHeader title="Tow jobs" subtitle="Dispatch, live status and ETA" />
      <Card style={{ marginBottom: 16 }}>
        <strong>Live map</strong>
        <p style={{ opacity: 0.7, margin: "8px 0 0" }}>
          A Google Maps live view of active jobs and driver locations renders here when a browser
          Maps key is configured. Server-side ETA snapshots back the customer and portal views.
        </p>
      </Card>
      <DataTable columns={columns} rows={jobs} empty="No tow jobs yet" />
    </div>
  );
}
