import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getInsurancePartnerPerformance, listAgreementVehicleMatrix, listInsurerAgreements } from "../lib/data";
import { saveVehiclePermission, updateAgreementStatus } from "../lib/actions";
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

  const [partners, matrix, agreements] = await Promise.all([
    getInsurancePartnerPerformance(tenant.id),
    listAgreementVehicleMatrix(tenant.id),
    listInsurerAgreements(tenant.id),
  ]);

  const agreementColumns: Column<Row>[] = [
    { key: "company", header: "Bärgningsbolag", render: (r) => String(r.tow_company_name ?? "—") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "pending")} /> },
    { key: "priority", header: "Prioritet", render: (r) => String(r.priority ?? 100) },
    { key: "sla", header: "SLA", render: (r) => `${String(r.sla_minutes ?? 45)} min` },
    { key: "pricing", header: "Prismodell", render: (r) => String(r.pricing_model ?? "standard") },
    {
      key: "decision",
      header: "Beslut",
      render: (r) => (
        <form action={updateAgreementStatus} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="agreement_id" value={String(r.id)} />
          <select
            name="status"
            defaultValue={["suspended", "terminated"].includes(String(r.status ?? "pending")) ? String(r.status) : "active"}
          >
            <option value="active">Godkänn/aktivera</option>
            <option value="suspended">Pausa</option>
            <option value="terminated">Avsluta</option>
          </select>
          <Button type="submit" variant="secondary">Spara</Button>
        </form>
      ),
    },
  ];

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
    { key: "perm", header: "Tillstånd", render: (r) => <StatusChip status={String(r.permission_status ?? "pending")} /> },
    { key: "eligible", header: "Får försäkringsuppdrag", render: (r) => (r.eligible_for_insurance_dispatch ? "Ja" : "Nej") },
    {
      key: "edit",
      header: "Ändra",
      render: (r) => (
        <form action={saveVehiclePermission} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="agreement_id" value={String(r.agreement_id)} />
          <input type="hidden" name="tow_vehicle_id" value={String(r.tow_vehicle_id)} />
          <select name="status" defaultValue={String(r.permission_status ?? "pending")}>
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

      <Card style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Avtalsförfrågningar och aktiva avtal</h3>
        <p style={{ opacity: 0.75 }}>
          Endast försäkringsbolaget kan aktivera, pausa eller avsluta ett avtal. Alla beslut loggas.
        </p>
      </Card>
      <DataTable columns={agreementColumns} rows={agreements} empty="Inga avtalsförfrågningar ännu." />

      <h3 style={{ marginTop: 32 }}>Partnerprestanda</h3>
      <DataTable
        columns={partnerColumns}
        rows={partners}
        empty="Ingen partneraktivitet ännu. Bärgningsbolag kopplas via avtal av plattformsansvarig."
      />

      <Card style={{ marginTop: 24, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Avtal och bärgningsbilar</h3>
        <p style={{ opacity: 0.75 }}>
          Försäkringsuppdrag skickas endast till aktiva avtal och till bärgningsbilar som försäkringsbolaget uttryckligen har godkänt.
          En ny bil är aldrig automatiskt behörig för försäkringsuppdrag.
        </p>
      </Card>
      <DataTable columns={matrixColumns} rows={matrix} empty="Inga avtalade bärgningsbilar hittades." />
    </div>
  );
}
