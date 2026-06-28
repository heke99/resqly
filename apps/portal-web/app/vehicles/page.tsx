import { Button, Card, DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listTowVehicles } from "../lib/data";
import { createTowVehicle } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  { key: "reg", header: "Reg #", render: (r) => String(r.registration_number ?? "") },
  { key: "type", header: "Type", render: (r) => String(r.vehicle_type ?? "") },
  { key: "weight", header: "Max kg", render: (r) => String(r.max_weight_kg ?? "-") },
  { key: "status", header: "Status", render: (r) => String(r.status ?? "") },
];

const VEHICLE_TYPES = [
  "flatbed",
  "wheel_lift",
  "heavy_tow",
  "motorcycle_tow",
  "service_van",
  "battery_service",
  "tire_service",
  "crane_truck",
  "special_transport",
];

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const vehicles = tenant ? await listTowVehicles(tenant.id) : [];
  return (
    <div>
      <PageHeader title="Tow vehicles" subtitle="Fleet & capabilities" />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={vehicles} empty="No tow vehicles yet" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Add tow vehicle</h3>
          <form action={createTowVehicle}>
            <input type="hidden" name="tenant_id" value={tenant?.id ?? ""} />
            <label htmlFor="registration_number">Registration number</label>
            <input id="registration_number" name="registration_number" required />
            <label htmlFor="vehicle_type">Type</label>
            <select id="vehicle_type" name="vehicle_type" defaultValue="flatbed">
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label htmlFor="max_weight_kg">Max weight (kg)</label>
            <input id="max_weight_kg" name="max_weight_kg" type="number" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <input type="checkbox" name="can_handle_ev" style={{ width: "auto" }} /> Can handle EV
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="has_flatbed" style={{ width: "auto" }} /> Has flatbed
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="has_winch" style={{ width: "auto" }} /> Has winch
            </label>
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Add vehicle</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
