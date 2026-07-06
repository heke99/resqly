import { Card, DataTable, EmptyState, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { towStatusLabel } from "@resqly/ui";
import { getActiveTenant } from "../../lib/tenant";
import {
  getDriverName,
  getPortalTowJob,
  getTowJobCompletionReport,
  getTowJobInvoice,
  listTowJobEvents,
  listTowJobLocations,
} from "../../lib/data";
import { NoTenant } from "../../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function formatTime(value: unknown): string {
  const s = String(value ?? "");
  return s ? s.slice(0, 16).replace("T", " ") : "—";
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;

  const job = await getPortalTowJob(tenant, id);
  if (!job) {
    return (
      <div>
        <PageHeader title="Bärgningsuppdrag" />
        <EmptyState title="Uppdraget hittades inte" hint="Uppdraget finns inte eller tillhör en annan organisation." />
      </div>
    );
  }

  const [events, report, invoice, driverName, locations] = await Promise.all([
    listTowJobEvents(tenant.id, id),
    getTowJobCompletionReport(tenant.id, id),
    getTowJobInvoice(tenant.id, id),
    getDriverName(tenant.id, (job.driver_id as string | null) ?? null),
    listTowJobLocations(tenant.id, (job.incident_id as string | null) ?? null),
  ]);
  const pickup = locations.find((l) => l.kind === "pickup");
  const destination = locations.find((l) => l.kind === "destination");
  const locationText = (loc: Row | undefined) => {
    if (!loc) return "—";
    if (loc.address) return String(loc.address);
    if (loc.lat != null && loc.lng != null) return `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}`;
    return "—";
  };

  const eventColumns: Column<Row>[] = [
    { key: "time", header: "Tid", render: (r) => formatTime(r.created_at) },
    { key: "from", header: "Från", render: (r) => (r.from_status ? towStatusLabel(String(r.from_status) as never) : "—") },
    { key: "to", header: "Till", render: (r) => towStatusLabel(String(r.to_status ?? "") as never) },
    { key: "reason", header: "Anteckning", render: (r) => String(r.reason ?? "—") },
  ];

  return (
    <div>
      <PageHeader
        title={`Uppdrag ${String(job.id).slice(0, 8).toUpperCase()}`}
        subtitle={`${job.payer_type === "customer_private" ? "Privat uppdrag" : "Försäkringsuppdrag"} • ${towStatusLabel(String(job.status) as never)}`}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Uppdraget</h3>
          <p style={{ margin: "4px 0" }}>Status: <StatusChip status={String(job.status ?? "")} /></p>
          <p style={{ margin: "4px 0" }}>Prioritet: {String(job.priority ?? "normal") === "high" ? "Hög" : String(job.priority ?? "normal") === "urgent" ? "Akut" : "Normal"}</p>
          <p style={{ margin: "4px 0" }}>Förare: {driverName ?? "Inte tilldelad ännu"}</p>
          <p style={{ margin: "4px 0" }}>Upphämtning: {locationText(pickup)}</p>
          <p style={{ margin: "4px 0" }}>Destination: {destination ? locationText(destination) : "Ej angiven"}</p>
          <p style={{ margin: "4px 0" }}>Skapat: {formatTime(job.created_at)}</p>
          {job.sla_deadline ? <p style={{ margin: "4px 0" }}>Tidsgräns: {formatTime(job.sla_deadline)}</p> : null}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Slutrapport</h3>
          {report ? (
            <>
              <p style={{ margin: "4px 0" }}>Utfört arbete: {String(report.work_performed ?? "—")}</p>
              <p style={{ margin: "4px 0" }}>Väntetid: {String(report.waiting_minutes ?? 0)} min</p>
              <p style={{ margin: "4px 0" }}>Bomkörning: {report.failed_trip ? "Ja" : "Nej"}</p>
              {report.observed_damages ? <p style={{ margin: "4px 0" }}>Skador: {String(report.observed_damages)}</p> : null}
              {report.comments ? <p style={{ margin: "4px 0" }}>Anteckningar: {String(report.comments)}</p> : null}
            </>
          ) : (
            <p style={{ opacity: 0.7 }}>Ingen slutrapport ännu.</p>
          )}
        </Card>
        <Card>
          <h3 style={{ marginTop: 0 }}>Fakturaunderlag</h3>
          {invoice ? (
            <>
              <p style={{ margin: "4px 0" }}>Status: <StatusChip status={String(invoice.status ?? "")} /></p>
              <p style={{ margin: "4px 0" }}>
                Summa: {(Number(invoice.total_minor ?? 0) / 100).toFixed(2)} {String(invoice.currency ?? "SEK")}
              </p>
            </>
          ) : (
            <p style={{ opacity: 0.7 }}>Inget fakturaunderlag ännu.</p>
          )}
        </Card>
      </div>
      <h3 style={{ marginTop: 24 }}>Händelser</h3>
      <DataTable columns={eventColumns} rows={events} empty="Inga händelser ännu" />
    </div>
  );
}
