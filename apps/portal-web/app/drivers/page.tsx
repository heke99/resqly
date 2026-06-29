import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listDrivers, listTowVehicles } from "../lib/data";
import { createDriver, setDriverVehicle } from "../lib/actions";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;
  const [drivers, vehicles] = await Promise.all([listDrivers(tenant.id), listTowVehicles(tenant.id)]);
  const vehicleReg = (id: unknown) =>
    vehicles.find((v) => v.id === id)?.registration_number != null
      ? String(vehicles.find((v) => v.id === id)?.registration_number)
      : "—";

  const columns: Column<Row>[] = [
    { key: "full_name", header: "Name", render: (r) => String(r.full_name ?? "") },
    { key: "phone", header: "Phone", render: (r) => String(r.phone ?? "-") },
    { key: "online", header: "Online", render: (r) => <StatusChip status={r.is_online ? "active" : "off_duty"} /> },
    { key: "duty_status", header: "Duty", render: (r) => String(r.duty_status ?? "") },
    { key: "vehicle", header: "Vehicle", render: (r) => vehicleReg(r.current_vehicle_id) },
    { key: "bankid", header: "BankID", render: (r) => (r.bankid_verified ? "Yes" : "No") },
    {
      key: "assign",
      header: "Assign vehicle",
      render: (r) => (
        <form action={setDriverVehicle} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="driver_id" value={String(r.id)} />
          <select name="vehicle_id" defaultValue={String(r.current_vehicle_id ?? "")}>
            <option value="">Unassigned</option>
            {vehicles.map((v) => (
              <option key={String(v.id)} value={String(v.id)}>
                {String(v.registration_number)}
              </option>
            ))}
          </select>
          <button type="submit" style={{ cursor: "pointer" }}>
            Set
          </button>
        </form>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Drivers" subtitle="Manage and assign your towing drivers" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={drivers} empty="No drivers yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Invite / add driver</h3>
          <form action={createDriver}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
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
