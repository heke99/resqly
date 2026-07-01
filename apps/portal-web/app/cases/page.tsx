import { Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listInsuranceCaseConsole } from "../lib/data";
import { NoTenant, WrongTenantType, formatSeconds, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function includesQuery(row: Row, q?: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [row.case_number, row.registration_number, row.customer_name, row.claim_number]
    .map((v) => String(v ?? "").toLowerCase())
    .some((v) => v.includes(needle));
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const rows = (await listInsuranceCaseConsole(tenant.id)).filter((row) => includesQuery(row, q));

  const columns: Column<Row>[] = [
    {
      key: "case_number",
      header: "Ärende",
      render: (r) => <a href={`/cases/${String(r.incident_id)}`}>{String(r.case_number ?? String(r.incident_id).slice(0, 8))}</a>,
    },
    { key: "customer", header: "Kund", render: (r) => String(r.customer_name ?? r.customer_email ?? "—") },
    { key: "vehicle", header: "Fordon", render: (r) => String(r.registration_number ?? "—") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.incident_status ?? "—")} /> },
    {
      key: "bankid",
      header: "BankID",
      render: (r) => (r.bankid_verified ? "Verifierat" : "Väntar"),
    },
    {
      key: "tow",
      header: "Bärgning",
      render: (r) => (r.tow_status ? <StatusChip status={String(r.tow_status)} /> : "Ej startad"),
    },
    { key: "eta", header: "ETA", render: (r) => (r.eta_seconds ? formatSeconds(r.eta_seconds) : "—") },
    { key: "evidence", header: "Bilagor", render: (r) => num(r.evidence_count) },
    { key: "next", header: "Nästa steg", render: (r) => String(r.next_action_label ?? "—") },
  ];

  return (
    <div>
      <PageHeader
        title="Ärenden"
        subtitle="Försäkringsbolagets operativa ärendekö: BankID, skadeuppgifter, bärgning, ETA och nästa åtgärd."
      />
      <Card style={{ marginBottom: 16 }}>
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="q">Sök ärendenummer, kund, registreringsnummer eller skadenummer</label>
            <input id="q" name="q" defaultValue={q ?? ""} placeholder="RFD-2026-000001" />
          </div>
          <button type="submit" style={{ padding: "10px 16px" }}>
            Sök
          </button>
        </form>
      </Card>
      <DataTable columns={columns} rows={rows} empty="Inga ärenden ännu" />
    </div>
  );
}
