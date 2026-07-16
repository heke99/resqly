import { Button, Card, DataTable, Field, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listAgreements, listInsuranceTenants } from "../lib/data";
import { saveAgreement } from "../lib/actions";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const [agreements, insurers] = await Promise.all([
    listAgreements(tenant.id),
    listInsuranceTenants(tenant.id),
  ]);
  const insurerName = (id: unknown) => insurers.find((i) => i.id === String(id))?.name ?? String(id).slice(0, 8);

  const columns: Column<Row>[] = [
    { key: "insurer", header: "Försäkringsbolag", render: (r) => insurerName(r.insurance_tenant_id) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "priority", header: "Prioritet", render: (r) => String(r.priority ?? 100) },
    { key: "sla", header: "SLA (min)", render: (r) => String(r.sla_minutes ?? 45) },
    { key: "pricing", header: "Prismodell", render: (r) => String(r.pricing_model ?? "standard") },
  ];

  return (
    <div>
      <PageHeader
        title="Försäkringsavtal"
        subtitle="Skicka en avtalsförfrågan. Försäkringsbolaget måste godkänna den innan uppdrag kan skickas."
      />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={agreements} empty="Inga avtal ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Skicka avtalsförfrågan</h3>
          <form action={saveAgreement} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <Field label="Insurance company">
              <select name="insurance_tenant_id" required>
                <option value="">Select insurer…</option>
                {insurers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <input type="hidden" name="status" value="pending" />
            <p style={{ margin: 0, opacity: 0.72 }}>Status blir väntande tills försäkringsbolaget godkänner avtalet.</p>
            <Field label="Priority (lower = preferred)">
              <input name="priority" type="number" defaultValue={100} />
            </Field>
            <Field label="SLA minutes">
              <input name="sla_minutes" type="number" defaultValue={45} />
            </Field>
            <Field label="Pricing model">
              <input name="pricing_model" defaultValue="standard" />
            </Field>
            <Button type="submit">Skicka förfrågan</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
