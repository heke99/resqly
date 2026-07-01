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
    { key: "job", header: "Job", render: (r) => String(r.tow_job_id ?? "").slice(0, 8) },
    { key: "driver", header: "Driver", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "—")} /> },
    { key: "rank", header: "Rank", render: (r) => String(r.rank ?? 0) },
    { key: "expires", header: "Expires", render: (r) => String(r.expires_at ?? "").slice(0, 16).replace("T", " ") },
    { key: "push", header: "Push", render: (r) => <StatusChip status={String(r.push_status ?? "pending")} /> },
  ];

  return (
    <div>
      <PageHeader title="Nya uppdrag" subtitle="Inkommande uppdrag till era förare" />
      <h3>Pending</h3>
      <DataTable columns={columns} rows={pending} empty="Inga väntande uppdrag just nu" />
      <h3 style={{ marginTop: 24 }}>Offer history</h3>
      <DataTable columns={columns} rows={history.slice(0, 50)} empty="Ingen uppdragshistorik ännu" />
    </div>
  );
}
