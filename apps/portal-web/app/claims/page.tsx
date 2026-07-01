import { DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listClaims, listIncidents } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;

  const [claims, incidents] = await Promise.all([listClaims(tenant.id), listIncidents(tenant.id)]);
  const damageCases = incidents.filter((i) => String(i.type) === "damage_claim");

  const claimColumns: Column<Row>[] = [
    { key: "claim", header: "Claim", render: (r) => String(r.claim_number ?? String(r.id).slice(0, 8)) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
  ];
  const caseColumns: Column<Row>[] = [
    {
      key: "case",
      header: "Case",
      render: (r) => <a href={`/cases/${String(r.id)}`}>{String(r.case_number ?? String(r.id).slice(0, 8))}</a>,
    },
    { key: "damage", header: "Damage type", render: (r) => String(r.damage_type ?? "—").replaceAll("_", " ") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "created", header: "Created", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
  ];

  return (
    <div>
      <PageHeader title="Skadeärenden" subtitle="Skadeärenden och försäkringsärenden för ert försäkringsbolag" />
      <h3>Claims</h3>
      <DataTable columns={claimColumns} rows={claims} empty="Inga skadeärenden registrerade ännu" />
      <h3 style={{ marginTop: 24 }}>Damage-claim cases</h3>
      <DataTable columns={caseColumns} rows={damageCases} empty="Inga skadeärenden ännu" />
    </div>
  );
}
