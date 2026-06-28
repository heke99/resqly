import { EmptyState, PageHeader, StatCard } from "@resqly/web-kit";
import { getActiveTenant } from "./lib/tenant";
import { listIncidents, listTowJobs } from "./lib/data";

export const dynamic = "force-dynamic";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) {
    return (
      <div>
        <PageHeader title="Partner portal" />
        <EmptyState
          title="No tenant available"
          hint="A superadmin must create your tenant first, then your users."
        />
      </div>
    );
  }
  const incidents = await listIncidents(tenant.id);
  const jobs = await listTowJobs(tenant.id);
  const open = incidents.filter((i) => !["closed", "cancelled", "rejected"].includes(String(i.status)));
  const activeJobs = jobs.filter((j) => !["closed", "cancelled"].includes(String(j.status)));

  return (
    <div>
      <PageHeader title={`${tenant.name} — Dashboard`} subtitle={`${tenant.type} • prefix ${tenant.case_number_prefix}`} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatCard label="Open cases" value={open.length} />
        <StatCard label="Total cases" value={incidents.length} />
        <StatCard label="Active tow jobs" value={activeJobs.length} />
        <StatCard label="Total tow jobs" value={jobs.length} />
      </div>
    </div>
  );
}
