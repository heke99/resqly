import { Button, Card, DataTable, PageHeader, type Column } from "@roadside/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listDrivers } from "../lib/data";
import { createDriver } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: "full_name", header: "Name", render: (r) => String(r.full_name ?? "") },
  { key: "phone", header: "Phone", render: (r) => String(r.phone ?? "-") },
  { key: "duty_status", header: "Duty", render: (r) => String(r.duty_status ?? "") },
  { key: "bankid", header: "BankID", render: (r) => (r.bankid_verified ? "Yes" : "No") },
];

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const drivers = tenant ? await listDrivers(tenant.id) : [];
  return (
    <div>
      <PageHeader title="Drivers" subtitle="Towing drivers" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={drivers} empty="No drivers yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Add driver</h3>
          <form action={createDriver}>
            <input type="hidden" name="tenant_id" value={tenant?.id ?? ""} />
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" name="full_name" required />
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" />
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Add driver</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
