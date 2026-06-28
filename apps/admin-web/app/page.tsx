import { PageHeader, StatCard } from "@resqly/web-kit";
import { listTenants } from "./lib/data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const tenants = await listTenants();
  const insurance = tenants.filter((t) => t.type === "insurance_company").length;
  const tow = tenants.filter((t) => t.type === "tow_company").length;

  return (
    <div>
      <PageHeader title="Superadmin dashboard" subtitle="Platform-wide overview" />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatCard label="Tenants" value={tenants.length} />
        <StatCard label="Insurance companies" value={insurance} />
        <StatCard label="Tow companies" value={tow} />
      </div>
      <p style={{ marginTop: 24, opacity: 0.7 }}>
        The platform starts empty. Create tenants under <a href="/tenants">Tenants</a> to begin. Each
        tenant gets its own branding, colors, case-number prefix, roles and settings.
      </p>
    </div>
  );
}
