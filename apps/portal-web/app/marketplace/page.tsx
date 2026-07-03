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
        title="Fri bärgning"
        subtitle="Styr om ni tar emot privat/direkt bärgning utan försäkringsavtal"
      />
      <Card style={{ maxWidth: 560 }}>
        <form action={saveMarketplaceSettings} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="accepts_direct_orders" defaultChecked={acceptsDirect} />
            Ta emot direkta uppdrag
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="private_customer_enabled" defaultChecked={privateEnabled} />
            Ta emot privatkunder
          </label>
          <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input type="checkbox" name="active" defaultChecked={active} />
            Fri bärgning aktiv
          </label>
          <Field label="Lägsta pris (SEK)">
            <input name="min_price_sek" type="number" min={0} step="1" defaultValue={minPrice} />
          </Field>
          <div>
            <Button type="submit">Spara inställningar</Button>
          </div>
        </form>
      </Card>
      <Card style={{ marginTop: 24, maxWidth: 560 }}>
        <strong>Så fungerar det</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          När en kund begär privat bärgning (utan försäkring) skickas erbjudandet bara till bärgningsbolag som har
          fri bärgning aktiverad här. Försäkringsuppdrag styrs alltid av era avtal — aldrig av den här inställningen.
        </p>
      </Card>
    </div>
  );
}
