import { Card, DataTable, Field, Filters, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { towStatusLabel } from "@resqly/ui";
import { getActiveTenant } from "../lib/tenant";
import { listCompanyJobs, listInsuranceTowJobs } from "../lib/data";
import { NoTenant } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const PRIORITY_LABELS: Record<string, string> = { normal: "Normal", high: "Hög", urgent: "Akut" };

const columns: Column<Row>[] = [
  {
    key: "id",
    header: "Uppdrag",
    render: (r) => <a href={`/jobs/${String(r.id)}`}>{String(r.id).slice(0, 8).toUpperCase()}</a>,
  },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
  { key: "priority", header: "Prioritet", render: (r) => PRIORITY_LABELS[String(r.priority ?? "normal")] ?? String(r.priority ?? "") },
  { key: "payer", header: "Betalning", render: (r) => (String(r.payer_type) === "customer_private" ? "Privat" : "Försäkring") },
  { key: "created", header: "Skapad", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
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
        title={isTow ? "Aktiva uppdrag" : "Bärgningsuppdrag"}
        subtitle="Tilldelning, livestatus och ETA"
      />
      <Filters>
        <Field label="Status">
          <select name="status" defaultValue={status}>
            <option value="">Alla</option>
            {["offered", "accepted", "driver_en_route", "driver_arrived", "transporting", "completed", "invoiced", "manual_review", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {towStatusLabel(s as never)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Betalare">
          <select name="payer" defaultValue={payer}>
            <option value="">Alla</option>
            <option value="insurance_company">Försäkringsbolag</option>
            <option value="customer_private">Fri/privat</option>
          </select>
        </Field>
      </Filters>
      <Card style={{ marginBottom: 16 }}>
        <strong>Export</strong>
        <p style={{ opacity: 0.7, margin: "8px 0 0" }}>
          <a href="/api/export/jobs">Ladda ner uppdragslistan (CSV)</a>
        </p>
      </Card>
      <DataTable columns={columns} rows={jobs} empty="Inga bärgningsuppdrag matchar filtren" />
    </div>
  );
}
