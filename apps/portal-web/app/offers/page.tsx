import { DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listCompanyOffers } from "../lib/data";
import { NoTenant, WrongTenantType } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const offers = await listCompanyOffers(tenant.id);
  const pending = offers.filter((o) => String(o.status) === "pending");
  const history = offers.filter((o) => String(o.status) !== "pending");

  const columns: Column<Row>[] = [
    { key: "job", header: "Uppdrag", render: (r) => <a href={`/jobs/${String(r.tow_job_id)}`}>{String(r.tow_job_id ?? "").slice(0, 8).toUpperCase()}</a> },
    { key: "driver", header: "Förare", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "rank", header: "Turordning", render: (r) => String(r.rank ?? 0) },
    { key: "expires", header: "Gäller till", render: (r) => String(r.expires_at ?? "").slice(0, 16).replace("T", " ") },
    { key: "push", header: "Notis", render: (r) => <StatusChip status={String(r.push_status ?? "pending")} /> },
  ];

  return (
    <div>
      <PageHeader title="Nya uppdrag" subtitle="Inkommande uppdrag till era förare" />
      <h3>Väntar på svar</h3>
      <DataTable columns={columns} rows={pending} empty="Inga väntande uppdrag just nu" />
      <h3 style={{ marginTop: 24 }}>Tidigare erbjudanden</h3>
      <DataTable columns={columns} rows={history.slice(0, 50)} empty="Ingen uppdragshistorik ännu" />
    </div>
  );
}
