import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getInsurancePartnerPerformance, listAgreementVehicleMatrix } from "../lib/data";
import { saveVehiclePermission } from "../lib/actions";
import { NoTenant, WrongTenantType, formatMoneyMinor, formatSeconds, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;

  const [partners, matrix] = await Promise.all([
    getInsurancePartnerPerformance(tenant.id),
    listAgreementVehicleMatrix(tenant.id),
  ]);

  const partnerColumns: Column<Row>[] = [
    { key: "name", header: "Bärgarpartner", render: (r) => String(r.tow_company_name ?? String(r.tow_company_id).slice(0, 8)) },
    { key: "jobs", header: "Uppdrag", render: (r) => num(r.jobs_total) },
    { key: "completed", header: "Slutförda", render: (r) => num(r.jobs_completed) },
    { key: "failed", header: "Misslyckade", render: (r) => num(r.jobs_failed) },
    {
      key: "sla",
      header: "SLA-träff",
      render: (r) => (r.sla_hit_rate != null ? `${Math.round(num(r.sla_hit_rate) * 100)}%` : "—"),
    },
    { key: "eta", header: "Snitt-ETA", render: (r) => formatSeconds(r.avg_eta_seconds) },
    { key: "revenue", header: "Kostnadsunderlag", render: (r) => formatMoneyMinor(r.revenue_minor) },
  ];

  const matrixColumns: Column<Row>[] = [
    { key: "company", header: "Bärgningsbolag", render: (r) => String(r.tow_company_name ?? "—") },
    { key: "agreement", header: "Avtal", render: (r) => <StatusChip status={String(r.agreement_status ?? "—")} /> },
    { key: "vehicle", header: "Bärgningsbil", render: (r) => `${String(r.registration_number ?? "—")} · ${String(r.vehicle_type ?? "—").replaceAll("_", " ")}` },
    { key: "duty", header: "Bilstatus", render: (r) => <StatusChip status={String(r.tow_vehicle_duty_status ?? r.tow_vehicle_status ?? "—")} /> },
    { key: "perm", header: "Tillstånd", render: (r) => <StatusChip status={String(r.permission_status ?? "implicit_active")} /> },
    { key: "eligible", header: "Får försäkringsuppdrag", render: (r) => (r.eligible_for_insurance_dispatch ? "Ja" : "Nej") },
    {
      key: "edit",
      header: "Ändra",
      render: (r) => (
        <form action={saveVehiclePermission} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="agreement_id" value={String(r.agreement_id)} />
          <input type="hidden" name="tow_vehicle_id" value={String(r.tow_vehicle_id)} />
          <select name="status" defaultValue={String(r.permission_status ?? "active").replace("implicit_active", "active")}>
            <option value="active">Godkänd</option>
            <option value="pending">Väntar</option>
            <option value="suspended">Spärrad</option>
            <option value="terminated">Avslutad</option>
          </select>
          <input name="notes" placeholder="Notering" style={{ width: 120 }} />
          <Button type="submit" variant="secondary">Spara</Button>
        </form>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Bärgarpartners"
        subtitle="Avtalade bärgningsbolag och exakt vilka bärgningsbilar som får notis för försäkringsuppdrag."
      />

      <h3>Partnerprestanda</h3>
      <DataTable
        columns={partnerColumns}
        rows={partners}
        empty="Ingen partneraktivitet ännu. Koppla bärgningsbolag via superadmin eller avtalssidan."
      />

      <Card style={{ marginTop: 24, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Avtal och bärgningsbilar</h3>
        <p style={{ opacity: 0.75 }}>
          Försäkringsuppdrag skickas endast till aktiva avtal. Om ett avtal har specifika tillståndsrader får bara de godkända bilarna notis.
          Om inga tillståndsrader finns på avtalet räknas aktiva bilar som implicit godkända.
        </p>
      </Card>
      <DataTable columns={matrixColumns} rows={matrix} empty="Inga avtalade bärgningsbilar hittades." />
    </div>
  );
}
