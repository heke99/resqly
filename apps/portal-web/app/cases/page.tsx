import { Card, DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listIncidents } from "../lib/data";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const columns: Column<Row>[] = [
  {
    key: "case_number",
    header: "Case #",
    render: (r) => <a href={`/cases/${r.id}`}>{String(r.case_number ?? r.id)}</a>,
  },
  { key: "type", header: "Type", render: (r) => String(r.type ?? "") },
  { key: "status", header: "Status", render: (r) => String(r.status ?? "") },
  { key: "bankid", header: "BankID", render: (r) => (r.bankid_verified ? "Verified" : "Pending") },
  { key: "created_at", header: "Created", render: (r) => String(r.created_at ?? "") },
];

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const incidents = tenant ? await listIncidents(tenant.id, q) : [];

  return (
    <div>
      <PageHeader title="Cases & claims" subtitle="Incoming towing cases and damage claims" />
      <Card style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="q">Search by case number</label>
            <input id="q" name="q" defaultValue={q ?? ""} placeholder="IF-2026-000001" />
          </div>
          <button type="submit" style={{ padding: "10px 16px" }}>
            Search
          </button>
        </form>
      </Card>
      <DataTable columns={columns} rows={incidents} empty="No cases yet" />
    </div>
  );
}
