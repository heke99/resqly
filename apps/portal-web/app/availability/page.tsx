import { Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listAvailabilityWindows, listDrivers } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToTime(m: unknown): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  const h = Math.floor(n / 60);
  const min = n % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const [windows, drivers] = await Promise.all([listAvailabilityWindows(tenant.id), listDrivers(tenant.id)]);
  const online = drivers.filter((d) => d.is_online);

  const windowColumns: Column<Row>[] = [
    { key: "day", header: "Day", render: (r) => WEEKDAYS[Number(r.weekday)] ?? String(r.weekday) },
    { key: "start", header: "Start", render: (r) => minutesToTime(r.start_minute) },
    { key: "end", header: "End", render: (r) => minutesToTime(r.end_minute) },
    { key: "oncall", header: "On call", render: (r) => (r.on_call ? "Yes" : "No") },
  ];
  const driverColumns: Column<Row>[] = [
    { key: "name", header: "Driver", render: (r) => String(r.full_name ?? "") },
    { key: "online", header: "Online", render: (r) => <StatusChip status={r.is_online ? "active" : "off_duty"} /> },
    { key: "duty", header: "Duty", render: (r) => String(r.duty_status ?? "") },
    { key: "seen", header: "Last seen", render: (r) => String(r.last_seen_at ?? "—").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Availability" subtitle="Operating windows and live driver availability" />
      <Card style={{ marginBottom: 24 }}>
        <strong>{online.length}</strong> of {drivers.length} drivers are online right now.
      </Card>
      <h3>Operating windows</h3>
      <DataTable columns={windowColumns} rows={windows} empty="No availability windows configured" />
      <h3 style={{ marginTop: 24 }}>Driver availability</h3>
      <DataTable columns={driverColumns} rows={drivers} empty="No drivers yet" />
    </div>
  );
}
