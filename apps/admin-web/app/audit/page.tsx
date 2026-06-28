import { DataTable, PageHeader, type Column } from "@roadside/web-kit";
import { listAuditLogs } from "../lib/data";

export const dynamic = "force-dynamic";

type AuditRow = Record<string, unknown>;

const columns: Column<AuditRow>[] = [
  { key: "created_at", header: "Time", render: (r) => String(r.created_at ?? "") },
  { key: "action", header: "Action", render: (r) => String(r.action ?? "") },
  { key: "entity_type", header: "Entity", render: (r) => String(r.entity_type ?? "") },
  { key: "entity_id", header: "Entity ID", render: (r) => String(r.entity_id ?? "") },
  { key: "fields", header: "Fields", render: (r) => (Array.isArray(r.fields) ? r.fields.join(", ") : "") },
];

export default async function AuditPage() {
  const logs = await listAuditLogs();
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Platform-wide audit trail" />
      <DataTable columns={columns} rows={logs} empty="No audit entries yet" />
    </div>
  );
}
