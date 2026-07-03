import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import {
  listAgreementVehicleMatrixAll,
  listAllAgreements,
  listAllMarketplaceSettings,
  listInsuranceTenantOptions,
  listTowCompanies,
} from "../lib/data";
import { saveVehiclePermissionAdmin, upsertAgreement, upsertMarketplace } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const AGREEMENT_STATUS: Array<{ value: string; label: string }> = [
  { value: "draft", label: "Utkast" },
  { value: "pending", label: "Väntar på godkännande" },
  { value: "active", label: "Aktivt" },
  { value: "paused", label: "Pausat" },
  { value: "suspended", label: "Spärrat" },
  { value: "expired", label: "Utgånget" },
  { value: "terminated", label: "Avslutat" },
];

const PERMISSION_STATUS: Array<{ value: string; label: string }> = [
  { value: "active", label: "Godkänd" },
  { value: "pending", label: "Väntar" },
  { value: "suspended", label: "Spärrad" },
  { value: "terminated", label: "Avslutad" },
];

export default async function AgreementsPage() {
  const [agreements, marketplace, towCompanies, insurers, vehicleMatrix] = await Promise.all([
    listAllAgreements(),
    listAllMarketplaceSettings(),
    listTowCompanies(),
    listInsuranceTenantOptions(),
    listAgreementVehicleMatrixAll(),
  ]);

  const companyName = (id: unknown) => towCompanies.find((c) => c.id === String(id))?.name ?? String(id).slice(0, 8);
  const insurerName = (id: unknown) => insurers.find((i) => i.id === String(id))?.name ?? String(id).slice(0, 8);

  const agreementColumns: Column<Row>[] = [
    { key: "tow", header: "Bärgningsbolag", render: (r) => companyName(r.tow_company_id) },
    { key: "insurer", header: "Försäkringsbolag", render: (r) => insurerName(r.insurance_tenant_id) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "priority", header: "Prioritet", render: (r) => String(r.priority ?? 100) },
    { key: "sla", header: "Tidsgräns (min)", render: (r) => String(r.sla_minutes ?? 45) },
  ];
  const marketplaceColumns: Column<Row>[] = [
    { key: "tow", header: "Bärgningsbolag", render: (r) => companyName(r.tow_company_id) },
    { key: "direct", header: "Direkta uppdrag", render: (r) => (r.accepts_direct_orders ? "Ja" : "Nej") },
    { key: "private", header: "Privatkunder", render: (r) => (r.private_customer_enabled ? "Ja" : "Nej") },
    { key: "active", header: "Aktiv", render: (r) => (r.active ? "Ja" : "Nej") },
  ];
  const vehicleColumns: Column<Row>[] = [
    { key: "insurer", header: "Försäkringsbolag", render: (r) => insurerName(r.insurance_tenant_id) },
    { key: "company", header: "Bärgningsbolag", render: (r) => String(r.tow_company_name ?? "—") },
    { key: "vehicle", header: "Bärgningsbil", render: (r) => String(r.registration_number ?? "—") },
    { key: "agreement", header: "Avtal", render: (r) => <StatusChip status={String(r.agreement_status ?? "—")} /> },
    { key: "eligible", header: "Får försäkringsuppdrag", render: (r) => (r.eligible_for_insurance_dispatch ? "Ja" : "Nej") },
    {
      key: "change",
      header: "Godkännande",
      render: (r) => (
        <form action={saveVehiclePermissionAdmin} style={{ display: "flex", gap: 6, margin: 0 }}>
          <input type="hidden" name="agreement_id" value={String(r.agreement_id)} />
          <input type="hidden" name="tow_vehicle_id" value={String(r.tow_vehicle_id)} />
          <select name="status" defaultValue={String(r.permission_status ?? "active").replace("implicit_active", "active")}>
            {PERMISSION_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" style={{ cursor: "pointer" }}>Spara</button>
        </form>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Avtal och fri bärgning"
        subtitle="Styr vilka bärgningsbolag som får försäkringsuppdrag och vilka som tar emot privata uppdrag."
      />

      <h3>Försäkringsavtal</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
        <DataTable columns={agreementColumns} rows={agreements} empty="Inga avtal ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Skapa/uppdatera avtal</h3>
          <form action={upsertAgreement} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Bärgningsbolag
              <select name="tow_company_id" required>
                <option value="">Välj…</option>
                {towCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Försäkringsbolag
              <select name="insurance_tenant_id" required>
                <option value="">Välj…</option>
                {insurers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue="active">
                {AGREEMENT_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioritet
              <input name="priority" type="number" defaultValue={100} />
            </label>
            <label>
              Tidsgräns (minuter)
              <input name="sla_minutes" type="number" defaultValue={45} />
            </label>
            <Button type="submit">Spara avtal</Button>
          </form>
        </Card>
      </div>

      <h3 style={{ marginTop: 32 }}>Godkända bärgningsbilar per avtal</h3>
      <p style={{ opacity: 0.72 }}>
        Om inga bilar godkänts uttryckligen får alla aktiva bilar hos det avtalade bolaget uppdrag. När minst en bil
        godkänts gäller endast godkännandena nedan.
      </p>
      <DataTable columns={vehicleColumns} rows={vehicleMatrix} empty="Inga avtal med bärgningsbilar ännu" />

      <h3 style={{ marginTop: 32 }}>Fri bärgning (privata uppdrag)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
        <DataTable columns={marketplaceColumns} rows={marketplace} empty="Inga inställningar för fri bärgning ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Uppdatera fri bärgning</h3>
          <form action={upsertMarketplace} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Bärgningsbolag
              <select name="tow_company_id" required>
                <option value="">Välj…</option>
                {towCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="accepts_direct_orders" /> Tar emot direkta uppdrag
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="private_customer_enabled" /> Tar emot privatkunder
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="active" defaultChecked /> Aktiv
            </label>
            <label>
              Lägsta pris (SEK)
              <input name="min_price_sek" type="number" min={0} defaultValue={0} />
            </label>
            <Button type="submit">Spara</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
