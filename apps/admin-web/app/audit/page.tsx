import { DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { listAuditLogs } from "../lib/data";

export const dynamic = "force-dynamic";

type AuditRow = Record<string, unknown>;

const columns: Column<AuditRow>[] = [
  { key: "created_at", header: "Tid", render: (r) => String(r.created_at ?? "") },
  { key: "action", header: "Åtgärd", render: (r) => String(r.action ?? "") },
  { key: "entity_type", header: "Objekt", render: (r) => String(r.entity_type ?? "") },
  { key: "entity_id", header: "Objekt-id", render: (r) => String(r.entity_id ?? "") },
  { key: "fields", header: "Fält", render: (r) => (Array.isArray(r.fields) ? r.fields.join(", ") : "") },
];

export default async function AuditPage() {
  const logs = await listAuditLogs();
  return (
    <div>
      <PageHeader title="Händelselogg" subtitle="Spårbara händelser i hela plattformen" />
      <DataTable columns={columns} rows={logs} empty="Inga händelser ännu" />
    </div>
  );
}
