import { DataTable, KpiGrid, PageHeader, StatCard, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listInvoices } from "../lib/data";
import { NoTenant, WrongTenantType, formatMoneyMinor, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const invoices = await listInvoices(tenant.id);
  const total = invoices.reduce((acc, i) => acc + num(i.total_minor), 0);
  const ready = invoices.filter((i) => String(i.status) === "ready");

  const columns: Column<Row>[] = [
    { key: "job", header: "Job", render: (r) => String(r.tow_job_id ?? "").slice(0, 8) },
    { key: "payer", header: "Payer", render: (r) => String(r.payer_type ?? "").replaceAll("_", " ") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "draft")} /> },
    { key: "subtotal", header: "Subtotal", render: (r) => formatMoneyMinor(r.subtotal_minor, String(r.currency ?? "SEK")) },
    { key: "vat", header: "VAT", render: (r) => formatMoneyMinor(r.vat_minor, String(r.currency ?? "SEK")) },
    { key: "total", header: "Total", render: (r) => formatMoneyMinor(r.total_minor, String(r.currency ?? "SEK")) },
  ];

  return (
    <div>
      <PageHeader title="Invoice basis" subtitle="Fakturaunderlag generated from completed jobs" />
      <KpiGrid>
        <StatCard label="Invoices" value={invoices.length} />
        <StatCard label="Ready to bill" value={ready.length} />
        <StatCard label="Total basis" value={formatMoneyMinor(total)} />
      </KpiGrid>
      <div style={{ marginTop: 24 }}>
        <DataTable columns={columns} rows={invoices} empty="No invoice basis generated yet" />
      </div>
    </div>
  );
}
