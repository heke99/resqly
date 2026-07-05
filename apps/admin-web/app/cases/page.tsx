import { Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { incidentStatusLabel } from "@resqly/ui";
import { searchCases } from "../lib/data";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function AdminCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const rows = await searchCases(q);

  const columns: Column<Row>[] = [
    {
      key: "case",
      header: "Ärendenummer",
      render: (r) => <a href={`/cases/${String(r.id)}`}>{String(r.case_number ?? String(r.id).slice(0, 8).toUpperCase())}</a>,
    },
    { key: "type", header: "Typ", render: (r) => (r.type === "damage_claim" ? "Skadeärende" : "Bärgning/assistans") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={incidentStatusLabel(String(r.status ?? ""))} /> },
    { key: "created", header: "Skapat", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Ärenden" subtitle="Sök ärenden för support och felsökning" />
      <Card style={{ maxWidth: 560, marginBottom: 24 }}>
        <form method="get" style={{ display: "flex", gap: 10 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Ärendenummer eller ärende-id"
            style={{ flex: 1 }}
            aria-label="Sök ärende"
          />
          <button type="submit">Sök</button>
        </form>
      </Card>
      <DataTable columns={columns} rows={rows} empty={q ? "Inga ärenden matchade sökningen." : "Inga ärenden ännu."} />
    </div>
  );
}
