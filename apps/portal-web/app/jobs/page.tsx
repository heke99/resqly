import { Card, DataTable, Field, Filters, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listCompanyJobs, listInsuranceTowJobs } from "../lib/data";
import { NoTenant } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: "id", header: "Uppdrag", render: (r) => String(r.id).slice(0, 8) },
  { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
  { key: "priority", header: "Prioritet", render: (r) => String(r.priority ?? "") },
  { key: "payer", header: "Betalare", render: (r) => String(r.payer_type ?? "").replaceAll("_", " ") },
  { key: "driver", header: "Förare", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
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
                  {s.replaceAll("_", " ")}
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
        <strong>Livekarta</strong>
        <p style={{ opacity: 0.7, margin: "8px 0 0" }}>
          Här visas en Google Maps-karta med aktiva uppdrag och förarpositioner när webbkartan är konfigurerad. ETA-snapshots från servern används i kund- och portalvyerna.
        </p>
      </Card>
      <DataTable columns={columns} rows={jobs} empty="Inga bärgningsuppdrag matchar filtren" />
    </div>
  );
}
