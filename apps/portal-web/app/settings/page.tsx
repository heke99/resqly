import { Button, Card, EmptyState, PageHeader } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getTenantSettings } from "../lib/data";
import { updateSettings } from "../lib/actions";

export const dynamic = "force-dynamic";

const STRATEGIES = [
  "nearest_available",
  "eta_first",
  "insurance_preferred_network",
  "sla_first",
  "cost_first",
  "manual_dispatch",
  "round_robin",
  "fallback_marketplace",
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) {
    return (
      <div>
        <PageHeader title="Settings" />
        <EmptyState title="No tenant" />
      </div>
    );
  }
  const settings = await getTenantSettings(tenant.id);

  return (
    <div>
      <PageHeader title="Settings & branding" subtitle={tenant.name} />
      <Card style={{ maxWidth: 520 }}>
        <form action={updateSettings}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <h3 style={{ marginTop: 0 }}>White-label</h3>
          <label htmlFor="product_name">Product name</label>
          <input id="product_name" name="product_name" defaultValue={tenant.name} />
          <label htmlFor="color_primary">Primary color</label>
          <input id="color_primary" name="color_primary" placeholder="#0B5FFF" />

          <h3>Dispatch</h3>
          <label htmlFor="default_dispatch_strategy">Default dispatch strategy</label>
          <select
            id="default_dispatch_strategy"
            name="default_dispatch_strategy"
            defaultValue={String(settings?.default_dispatch_strategy ?? "eta_first")}
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label htmlFor="max_dispatch_radius_km">Max dispatch radius (km)</label>
          <input
            id="max_dispatch_radius_km"
            name="max_dispatch_radius_km"
            type="number"
            defaultValue={String(settings?.max_dispatch_radius_km ?? 50)}
          />
          <div style={{ marginTop: 16 }}>
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
