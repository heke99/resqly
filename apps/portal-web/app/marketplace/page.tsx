import { Button, Card, Field, PageHeader } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getMarketplaceSettings } from "../lib/data";
import { saveMarketplaceSettings } from "../lib/actions";
import { NoTenant, WrongTenantType, num } from "../lib/ui";

export const dynamic = "force-dynamic";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const settings = await getMarketplaceSettings(tenant.id);
  const acceptsDirect = Boolean(settings?.accepts_direct_orders);
  const privateEnabled = Boolean(settings?.private_customer_enabled);
  const active = settings ? Boolean(settings.active) : true;
  const minPrice = (num(settings?.min_price_minor) / 100).toString();

  return (
    <div>
      <PageHeader
        title="Direct marketplace"
        subtitle="Control whether you receive direct / private towing orders (no insurance agreement required)"
      />
      <Card style={{ maxWidth: 560 }}>
        <form action={saveMarketplaceSettings} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="accepts_direct_orders" defaultChecked={acceptsDirect} />
            Accept direct marketplace orders
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="private_customer_enabled" defaultChecked={privateEnabled} />
            Enable private customer towing
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="active" defaultChecked={active} />
            Marketplace participation active
          </label>
          <Field label="Minimum price (SEK)">
            <input name="min_price_sek" type="number" min={0} step="1" defaultValue={minPrice} />
          </Field>
          <div>
            <Button type="submit">Save settings</Button>
          </div>
        </form>
      </Card>
      <Card style={{ marginTop: 24, maxWidth: 560 }}>
        <strong>How this works</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          When a customer requests private towing (without insurance), only tow companies with direct marketplace
          orders enabled are eligible to receive the dispatch offer. Insurance jobs are routed via your agreements,
          not this setting.
        </p>
      </Card>
    </div>
  );
}
