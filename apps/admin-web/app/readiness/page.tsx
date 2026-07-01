import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { listInsurerReadiness } from "../lib/data";
import { createStagingDemo } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default async function AdminReadinessPage() {
  const rows = await listInsurerReadiness();
  const columns: Column<Row>[] = [
    { key: "name", header: "Försäkringsbolag", render: (r) => String(r.insurer_name ?? "—") },
    { key: "ready", header: "Pilotklar", render: (r) => <StatusChip status={r.ready_for_paid_pilot ? "redo" : "blockerad"} tone={r.ready_for_paid_pilot ? "success" : "warning"} /> },
    { key: "agreements", header: "Avtal", render: (r) => num(r.active_agreements) },
    { key: "vehicles", header: "Behöriga bilar", render: (r) => num(r.eligible_tow_vehicles) },
    { key: "legal", header: "Juridik", render: (r) => num(r.active_legal_versions) },
    { key: "fallback", header: "Fallback", render: (r) => num(r.enabled_fallback_rules) },
    {
      key: "blockers",
      header: "Blockerare",
      render: (r) => (Array.isArray(r.blockers) && r.blockers.length ? (r.blockers as string[]).join(", ") : "—"),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Produktionsklarhet"
        subtitle="Superadmin-vy för försäkringsbolag som ska kunna säljas, demoas eller gå till betald pilot."
      />
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Staging-demo</h3>
        <p style={{ opacity: 0.75 }}>
          Skapar en deterministisk demo med ett försäkringsbolag, två godkända bärgningsbolag, en spärrad partner och en fri marketplace-partner. Blockerad i production.
        </p>
        <form action={createStagingDemo}>
          <Button type="submit">Skapa/uppdatera staging-demo</Button>
        </form>
      </Card>
      <DataTable columns={columns} rows={rows} empty="Ingen readiness-data ännu" />
    </div>
  );
}
