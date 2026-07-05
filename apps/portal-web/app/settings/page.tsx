import { Button, Card, EmptyState, PageHeader } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getTenantSettings } from "../lib/data";
import { updateSettings } from "../lib/actions";

export const dynamic = "force-dynamic";

const STRATEGIES: Array<{ value: string; label: string }> = [
  { value: "nearest_available", label: "Närmast tillgänglig först" },
  { value: "eta_first", label: "Kortast ankomsttid först" },
  { value: "insurance_preferred_network", label: "Avtalade partners först" },
  { value: "sla_first", label: "Tidsgräns (SLA) först" },
  { value: "cost_first", label: "Lägst kostnad först" },
  { value: "manual_dispatch", label: "Manuell tilldelning" },
  { value: "round_robin", label: "Jämn fördelning" },
  { value: "fallback_marketplace", label: "Reserv: fri bärgning" },
];

export default async function InställningarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) {
    return (
      <div>
        <PageHeader title="Inställningar" />
        <EmptyState title="Ingen organisation" />
      </div>
    );
  }
  const settings = await getTenantSettings(tenant.id);

  return (
    <div>
      <PageHeader title="Inställningar och varumärke" subtitle={tenant.name} />
      <Card style={{ maxWidth: 520 }}>
        <form action={updateSettings}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <h3 style={{ marginTop: 0 }}>Varumärke</h3>
          <label htmlFor="product_name">Produktnamn</label>
          <input id="product_name" name="product_name" defaultValue={tenant.name} />
          <label htmlFor="color_primary">Huvudfärg</label>
          <input id="color_primary" name="color_primary" placeholder="#0B5FFF" />

          <h3>Utskick av uppdrag</h3>
          <label htmlFor="default_dispatch_strategy">Hur uppdrag fördelas</label>
          <select
            id="default_dispatch_strategy"
            name="default_dispatch_strategy"
            defaultValue={String(settings?.default_dispatch_strategy ?? "eta_first")}
          >
            {STRATEGIES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <label htmlFor="max_dispatch_radius_km">Största sökradie (km)</label>
          <input
            id="max_dispatch_radius_km"
            name="max_dispatch_radius_km"
            type="number"
            defaultValue={String(settings?.max_dispatch_radius_km ?? 50)}
          />

          {tenant.type === "insurance_company" ? (
            <>
              <h3>Antaganden för besparingsstatistik</h3>
              <label htmlFor="stats_minutes_saved_per_case">Sparad handläggartid per ärende (minuter)</label>
              <input
                id="stats_minutes_saved_per_case"
                name="stats_minutes_saved_per_case"
                type="number"
                min={0}
                defaultValue={String(settings?.stats_minutes_saved_per_case ?? 45)}
              />
              <label htmlFor="stats_admin_hourly_cost_sek">Handläggarkostnad per timme (SEK)</label>
              <input
                id="stats_admin_hourly_cost_sek"
                name="stats_admin_hourly_cost_sek"
                type="number"
                min={0}
                defaultValue={String(Number(settings?.stats_admin_hourly_cost_minor ?? 45000) / 100)}
              />
            </>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Button type="submit">Spara inställningar</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
