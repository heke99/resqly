import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getPlatformRuntimeReadiness, listInsurerReadiness, listTowReadiness } from "../lib/data";
import { createStagingDemo } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const isProduction = (process.env.APP_ENV ?? process.env.NODE_ENV) === "production";

export default async function AdminReadinessPage() {
  const [insurers, towCompanies, runtime] = await Promise.all([
    listInsurerReadiness(),
    listTowReadiness(),
    getPlatformRuntimeReadiness(),
  ]);

  const insurerColumns: Column<Row>[] = [
    { key: "name", header: "Försäkringsbolag", render: (r) => String(r.insurer_name ?? "—") },
    { key: "ready", header: "Status", render: (r) => <StatusChip status={r.ready_for_paid_pilot ? "Redo för drift" : "Behöver åtgärdas"} tone={r.ready_for_paid_pilot ? "success" : "warning"} /> },
    { key: "agreements", header: "Aktiva avtal", render: (r) => num(r.active_agreements) },
    { key: "vehicles", header: "Behöriga bilar", render: (r) => num(r.eligible_tow_vehicles) },
    { key: "legal", header: "Juridiska texter", render: (r) => num(r.active_legal_versions) },
    { key: "fallback", header: "Reservkanaler", render: (r) => num(r.enabled_fallback_rules) },
    {
      key: "blockers",
      header: "Behöver åtgärdas",
      render: (r) => (Array.isArray(r.blockers) && r.blockers.length ? (r.blockers as string[]).join(", ") : "—"),
    },
  ];

  const towColumns: Column<Row>[] = [
    { key: "name", header: "Bärgningsbolag", render: (r) => String(r.tow_company_name ?? "—") },
    { key: "ready", header: "Status", render: (r) => <StatusChip status={r.ready_for_live_operation ? "Redo för drift" : "Behöver åtgärdas"} tone={r.ready_for_live_operation ? "success" : "warning"} /> },
    { key: "drivers", header: "Aktiva förare", render: (r) => num(r.active_drivers) },
    { key: "login", header: "Förare med konto", render: (r) => num(r.loginable_drivers) },
    { key: "vehicles", header: "Aktiva bilar", render: (r) => num(r.active_vehicles) },
    { key: "push", header: "Notisenheter", render: (r) => num(r.push_devices) },
    { key: "agreements", header: "Aktiva avtal", render: (r) => num(r.active_agreements) },
    { key: "private", header: "Fri bärgning", render: (r) => (r.accepts_private_jobs ? "Ja" : "Nej") },
    {
      key: "blockers",
      header: "Behöver åtgärdas",
      render: (r) => (Array.isArray(r.blockers) && r.blockers.length ? (r.blockers as string[]).join(", ") : "—"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Redo för drift"
        subtitle="Checklistor per organisation — allt ska vara grönt innan skarpa ärenden tas emot."
      />
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Teknisk driftstatus</h3>
        <p>
          <StatusChip
            status={runtime.ready ? "Redo för drift" : "Launch blockerad"}
            tone={runtime.ready ? "success" : "danger"}
          />
        </p>
        <p style={{ opacity: 0.8 }}>
          Databas: {runtime.databaseReachable ? "ansluten" : "inte tillgänglig"} · Väntande webhooks: {runtime.pendingWebhooks} ·
          Misslyckade webhooks: {runtime.failedWebhooks} · Väntande notifieringar: {runtime.pendingNotifications} ·
          Misslyckade notifieringar: {runtime.failedNotifications}
        </p>
        {runtime.workers.length ? (
          <ul>
            {runtime.workers.map((worker) => (
              <li key={`${worker.worker_name}-${worker.instance_id}`}>
                {worker.worker_name}: {worker.status}{worker.stale ? " · heartbeat för gammal" : " · aktiv"}
                {worker.last_error ? ` · ${worker.last_error}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p>Ingen worker-heartbeat har registrerats.</p>
        )}
        {runtime.blockers.length ? (
          <div>
            <strong>Blockerare</strong>
            <ul>{runtime.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          </div>
        ) : null}
      </Card>
      {!isProduction ? (
        <Card style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Testmiljö</h3>
          <p style={{ opacity: 0.75 }}>
            Skapar en komplett testuppsättning i den här miljön: ett försäkringsbolag, två godkända bärgningsbolag,
            en spärrad partner och en partner för fri bärgning. Kan aldrig köras i produktionsmiljön.
          </p>
          <form action={createStagingDemo}>
            <Button type="submit">Skapa/uppdatera testuppsättning</Button>
          </form>
        </Card>
      ) : null}
      <h3>Försäkringsbolag</h3>
      <DataTable columns={insurerColumns} rows={insurers} empty="Inga försäkringsbolag ännu" />
      <h3 style={{ marginTop: 24 }}>Bärgningsbolag</h3>
      <DataTable columns={towColumns} rows={towCompanies} empty="Inga bärgningsbolag ännu" />
    </div>
  );
}
