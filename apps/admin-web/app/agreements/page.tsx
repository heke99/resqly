import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import {
  listAllAgreements,
  listAllMarketplaceSettings,
  listInsuranceTenantOptions,
  listTowCompanies,
} from "../lib/data";
import { upsertAgreement, upsertMarketplace } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AgreementsPage() {
  const [agreements, marketplace, towCompanies, insurers] = await Promise.all([
    listAllAgreements(),
    listAllMarketplaceSettings(),
    listTowCompanies(),
    listInsuranceTenantOptions(),
  ]);

  const companyName = (id: unknown) => towCompanies.find((c) => c.id === String(id))?.name ?? String(id).slice(0, 8);
  const insurerName = (id: unknown) => insurers.find((i) => i.id === String(id))?.name ?? String(id).slice(0, 8);

  const agreementColumns: Column<Row>[] = [
    { key: "tow", header: "Tow company", render: (r) => companyName(r.tow_company_id) },
    { key: "insurer", header: "Insurance company", render: (r) => insurerName(r.insurance_tenant_id) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "priority", header: "Priority", render: (r) => String(r.priority ?? 100) },
    { key: "sla", header: "SLA (min)", render: (r) => String(r.sla_minutes ?? 45) },
  ];
  const marketplaceColumns: Column<Row>[] = [
    { key: "tow", header: "Tow company", render: (r) => companyName(r.tow_company_id) },
    { key: "direct", header: "Direct orders", render: (r) => (r.accepts_direct_orders ? "Yes" : "No") },
    { key: "private", header: "Private customers", render: (r) => (r.private_customer_enabled ? "Yes" : "No") },
    { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
  ];

  return (
    <div>
      <PageHeader
        title="Agreements & marketplace"
        subtitle="Configure which tow companies serve which insurers, and who accepts direct orders."
      />

      <h3>Insurance agreements</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={agreementColumns} rows={agreements} empty="No agreements yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Add / update agreement</h3>
          <form action={upsertAgreement} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Tow company
              <select name="tow_company_id" required>
                <option value="">Select…</option>
                {towCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Insurance company
              <select name="insurance_tenant_id" required>
                <option value="">Select…</option>
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
                {["active", "pending", "suspended", "terminated"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <input name="priority" type="number" defaultValue={100} />
            </label>
            <label>
              SLA minutes
              <input name="sla_minutes" type="number" defaultValue={45} />
            </label>
            <Button type="submit">Save agreement</Button>
          </form>
        </Card>
      </div>

      <h3 style={{ marginTop: 32 }}>Direct marketplace</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={marketplaceColumns} rows={marketplace} empty="No marketplace settings yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Update marketplace</h3>
          <form action={upsertMarketplace} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label>
              Tow company
              <select name="tow_company_id" required>
                <option value="">Select…</option>
                {towCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="accepts_direct_orders" /> Accepts direct orders
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="private_customer_enabled" /> Private customers enabled
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="active" defaultChecked /> Active
            </label>
            <label>
              Minimum price (SEK)
              <input name="min_price_sek" type="number" min={0} defaultValue={0} />
            </label>
            <Button type="submit">Save marketplace</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
