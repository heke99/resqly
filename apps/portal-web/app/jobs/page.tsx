import { Card, DataTable, Field, Filters, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listCompanyJobs, listInsuranceTowJobs } from "../lib/data";
import { NoTenant } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: "id", header: "Job", render: (r) => String(r.id).slice(0, 8) },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
  { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "") },
  { key: "payer", header: "Payer", render: (r) => String(r.payer_type ?? "").replaceAll("_", " ") },
  { key: "driver", header: "Driver", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
  { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
];

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  const isTow = tenant.type === "tow_company";
  const all = isTow ? await listCompanyJobs(tenant.id) : await listInsuranceTowJobs(tenant.id);
  const status = typeof sp.status === "string" ? sp.status : "";
  const payer = typeof sp.payer === "string" ? sp.payer : "";
  const jobs = all.filter(
    (j) => (!status || String(j.status) === status) && (!payer || String(j.payer_type) === payer),
  );

  return (
    <div>
      <PageHeader
        title={isTow ? "Active jobs" : "Tow jobs"}
        subtitle="Dispatch, live status and ETA"
      />
      <Filters>
        <Field label="Status">
          <select name="status" defaultValue={status}>
            <option value="">All</option>
            {["offered", "accepted", "driver_en_route", "driver_arrived", "transporting", "completed", "invoiced", "manual_review", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Payer">
          <select name="payer" defaultValue={payer}>
            <option value="">All</option>
            <option value="insurance_company">Insurance</option>
            <option value="customer_private">Direct / private</option>
          </select>
        </Field>
      </Filters>
      <Card style={{ marginBottom: 16 }}>
        <strong>Live map</strong>
        <p style={{ opacity: 0.7, margin: "8px 0 0" }}>
          A Google Maps live view of active jobs and driver locations renders here when a browser
          Maps key is configured. Server-side ETA snapshots back the customer and portal views.
        </p>
      </Card>
      <DataTable columns={columns} rows={jobs} empty="No tow jobs match these filters" />
    </div>
  );
}
