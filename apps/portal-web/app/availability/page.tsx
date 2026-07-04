import { Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listAvailabilityWindows, listDrivers } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];

function minutesToTime(m: unknown): string {
  const n = Number(m);
  if (!Number.isFinite(n)) return "—";
  const h = Math.floor(n / 60);
  const min = n % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default async function TillgänglighetPage({
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

  const DUTY_LABELS: Record<string, string> = {
    off_duty: "Ej i tjänst",
    on_duty: "I tjänst",
    on_call: "Jour",
    busy: "Upptagen",
  };

  const windowColumns: Column<Row>[] = [
    { key: "day", header: "Dag", render: (r) => WEEKDAYS[Number(r.weekday)] ?? String(r.weekday) },
    { key: "start", header: "Öppnar", render: (r) => minutesToTime(r.start_minute) },
    { key: "end", header: "Stänger", render: (r) => minutesToTime(r.end_minute) },
    { key: "oncall", header: "Jour", render: (r) => (r.on_call ? "Ja" : "Nej") },
  ];
  const driverColumns: Column<Row>[] = [
    { key: "name", header: "Förare", render: (r) => String(r.full_name ?? "") },
    { key: "online", header: "Status", render: (r) => <StatusChip status={r.is_online ? "active" : "off_duty"} /> },
    { key: "duty", header: "Tjänst", render: (r) => DUTY_LABELS[String(r.duty_status ?? "")] ?? String(r.duty_status ?? "") },
    { key: "seen", header: "Senast sedd", render: (r) => String(r.last_seen_at ?? "—").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Tillgänglighet" subtitle="Öppettider och aktuell förartillgänglighet" />
      <Card style={{ marginBottom: 24 }}>
        <strong>{online.length}</strong> av {drivers.length} förare är i tjänst just nu.
      </Card>
      <h3>Öppettider</h3>
      <DataTable columns={windowColumns} rows={windows} empty="Inga tillgänglighetstider konfigurerade" />
      <h3 style={{ marginTop: 24 }}>Förartillgänglighet</h3>
      <DataTable columns={driverColumns} rows={drivers} empty="Inga förare ännu" />
    </div>
  );
}
