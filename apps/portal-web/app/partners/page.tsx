import { DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getInsurancePartnerPerformance } from "../lib/data";
import { NoTenant, WrongTenantType, formatMoneyMinor, formatSeconds, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;

  const partners = await getInsurancePartnerPerformance(tenant.id);

  const columns: Column<Row>[] = [
    { key: "name", header: "Tow partner", render: (r) => String(r.tow_company_name ?? String(r.tow_company_id).slice(0, 8)) },
    { key: "jobs", header: "Jobs", render: (r) => num(r.jobs_total) },
    { key: "completed", header: "Completed", render: (r) => num(r.jobs_completed) },
    { key: "failed", header: "Failed", render: (r) => num(r.jobs_failed) },
    {
      key: "sla",
      header: "SLA hit rate",
      render: (r) => (r.sla_hit_rate != null ? `${Math.round(num(r.sla_hit_rate) * 100)}%` : "—"),
    },
    { key: "eta", header: "Avg ETA", render: (r) => formatSeconds(r.avg_eta_seconds) },
    { key: "revenue", header: "Cost basis", render: (r) => formatMoneyMinor(r.revenue_minor) },
  ];

  return (
    <div>
      <PageHeader title="Tow partners" subtitle="Performance of the tow companies handling your cases" />
      <DataTable
        columns={columns}
        rows={partners}
        empty="No partner activity yet. Connect tow companies via agreements in the superadmin console."
      />
    </div>
  );
}
