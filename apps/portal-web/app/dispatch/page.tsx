import { Card, DataTable, KpiGrid, PageHeader, StatCard, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listCompanyJobs, listFörare } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const ACTIVE = ["accepted", "driver_en_route", "driver_arrived", "vehicle_loaded", "transporting", "delivered"];

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const [jobs, drivers] = await Promise.all([listCompanyJobs(tenant.id), listFörare(tenant.id)]);
  const active = jobs.filter((j) => ACTIVE.includes(String(j.status)));
  const offered = jobs.filter((j) => String(j.status) === "offered");
  const online = drivers.filter((d) => d.is_online);

  const jobColumns: Column<Row>[] = [
    { key: "job", header: "Job", render: (r) => String(r.id).slice(0, 8) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
    { key: "priority", header: "Priority", render: (r) => String(r.priority ?? "normal") },
    { key: "driver", header: "Driver", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
  ];
  const driverColumns: Column<Row>[] = [
    { key: "name", header: "Driver", render: (r) => String(r.full_name ?? "") },
    { key: "online", header: "Status", render: (r) => <StatusChip status={r.is_online ? "active" : "off_duty"} /> },
    { key: "loc", header: "Last location", render: (r) =>
        r.last_lat != null && r.last_lng != null ? `${Number(r.last_lat).toFixed(3)}, ${Number(r.last_lng).toFixed(3)}` : "—" },
  ];

  return (
    <div>
      <PageHeader title="Tilldelningstavla" subtitle="Livekontroll av uppdrag, aktiva körningar och förare" />
      <KpiGrid>
        <StatCard label="Offered" value={offered.length} />
        <StatCard label="Aktiva uppdrag" value={active.length} />
        <StatCard label="Förare online" value={online.length} />
      </KpiGrid>
      <Card style={{ marginTop: 24, marginBottom: 24 }}>
        <strong>Live map</strong>
        <p style={{ opacity: 0.7, margin: "8px 0 0" }}>
          Driver positions and active job pickups render on a Google Map here when a browser Maps key is configured.
          Positions below come from each driver&apos;s latest reported location.
        </p>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        <div>
          <h3>Aktiva uppdrag</h3>
          <DataTable columns={jobColumns} rows={active} empty="Inga aktiva uppdrag" />
        </div>
        <div>
          <h3>Förare</h3>
          <DataTable columns={driverColumns} rows={drivers} empty="Inga förare ännu" />
        </div>
      </div>
    </div>
  );
}
