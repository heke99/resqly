import { Card, DataTable, PageHeader, Button, type Column } from "@resqly/web-kit";
import { listTenants, type TenantRow } from "../lib/data";
import { createTenant } from "../lib/actions";

export const dynamic = "force-dynamic";

const columns: Column<TenantRow>[] = [
  { key: "name", header: "Name", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Type", render: (t) => t.type },
  { key: "slug", header: "Slug", render: (t) => t.slug },
  { key: "prefix", header: "Case prefix", render: (t) => t.case_number_prefix },
  { key: "status", header: "Status", render: (t) => t.status },
];

export default async function TenantsPage() {
  const tenants = await listTenants();
  return (
    <div>
      <PageHeader title="Tenants" subtitle="Insurance companies, towing companies and partners" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={tenants} empty="No tenants yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Create tenant</h3>
          <form action={createTenant}>
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue="insurance_company">
              <option value="insurance_company">Insurance company</option>
              <option value="tow_company">Tow company</option>
              <option value="fleet_company">Fleet company</option>
              <option value="leasing_company">Leasing company</option>
              <option value="workshop_partner">Workshop partner</option>
              <option value="platform_internal">Platform internal</option>
            </select>
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="If Försäkring" required />
            <label htmlFor="slug">Slug</label>
            <input id="slug" name="slug" placeholder="if" required />
            <label htmlFor="case_number_prefix">Case number prefix</label>
            <input id="case_number_prefix" name="case_number_prefix" placeholder="IF" required />
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Create tenant</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
