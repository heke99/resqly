import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listDrivers, listTowVehicles } from "../lib/data";
import { createDriver, setDriverVehicle } from "../lib/actions";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function FörarePage({
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

  const DUTY_LABELS: Record<string, string> = {
    off_duty: "Ej i tjänst",
    on_duty: "I tjänst",
    on_call: "Jour",
    busy: "Upptagen",
  };

  const columns: Column<Row>[] = [
    { key: "full_name", header: "Namn", render: (r) => String(r.full_name ?? "") },
    { key: "phone", header: "Telefon", render: (r) => String(r.phone ?? "—") },
    { key: "online", header: "Status", render: (r) => <StatusChip status={r.is_online ? "active" : "off_duty"} /> },
    { key: "duty_status", header: "Tjänst", render: (r) => DUTY_LABELS[String(r.duty_status ?? "")] ?? String(r.duty_status ?? "") },
    { key: "seen", header: "Senast sedd", render: (r) => String(r.last_seen_at ?? "—").slice(0, 16).replace("T", " ") },
    { key: "vehicle", header: "Bärgningsbil", render: (r) => vehicleReg(r.current_vehicle_id) },
    { key: "login", header: "Kan logga in", render: (r) => (r.user_id ? "Ja" : "Nej") },
    {
      key: "assign",
      header: "Tilldela bil",
      render: (r) => (
        <form action={setDriverVehicle} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="driver_id" value={String(r.id)} />
          <select name="vehicle_id" defaultValue={String(r.current_vehicle_id ?? "")}>
            <option value="">Ingen bil</option>
            {vehicles.map((v) => (
              <option key={String(v.id)} value={String(v.id)}>
                {String(v.registration_number)}
              </option>
            ))}
          </select>
          <button type="submit" style={{ cursor: "pointer" }}>
            Spara
          </button>
        </form>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Förare" subtitle="Bjud in förare, tilldela bilar och följ tillgänglighet" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24, alignItems: "start" }}>
        <DataTable columns={columns} rows={drivers} empty="Inga förare ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Lägg till förare</h3>
          <form action={createDriver}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="full_name">Namn</label>
            <input id="full_name" name="full_name" required />
            <label htmlFor="phone">Telefon</label>
            <input id="phone" name="phone" />
            <label htmlFor="email">E-post</label>
            <input id="email" name="email" type="email" />
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <input type="checkbox" name="send_invite" defaultChecked />
              Skicka inbjudan så att föraren kan logga in i förar-appen
            </label>
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Lägg till förare</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
