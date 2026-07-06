import { Button, Card, Field, PageHeader } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getCompanyPriceList } from "../lib/data";
import { savePriceList } from "../lib/actions";
import { NoTenant, WrongTenantType, num } from "../lib/ui";

export const dynamic = "force-dynamic";

function sek(minor: unknown): string {
  return (num(minor) / 100).toString();
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "tow_company") return <WrongTenantType need="tow_company" />;

  const priceList = await getCompanyPriceList(tenant.id);

  return (
    <div>
      <PageHeader
        title="Priser för fri bärgning"
        subtitle="Kunder ser en prisuppskattning byggd på de här faktorerna innan de skickar sin förfrågan. Priset låses när ni accepterar ett uppdrag."
      />
      <Card style={{ maxWidth: 560 }}>
        <form action={savePriceList} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <Field label="Grundavgift (SEK)">
            <input name="start_fee_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.start_fee_minor)} />
          </Field>
          <Field label="Pris per kilometer (SEK)">
            <input name="per_km_sek" type="number" min={0} step="0.5" defaultValue={sek(priceList?.per_km_minor)} />
          </Field>
          <Field label="Lägsta pris (SEK)">
            <input name="minimum_price_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.minimum_price_minor)} />
          </Field>
          <Field label="Väntetid per minut (SEK)">
            <input name="per_waiting_minute_sek" type="number" min={0} step="0.5" defaultValue={sek(priceList?.per_waiting_minute_minor)} />
          </Field>
          <Field label="Kvälls-/nattillägg (SEK)">
            <input name="evening_night_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.evening_night_surcharge_minor)} />
          </Field>
          <Field label="Helgtillägg (SEK)">
            <input name="weekend_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.weekend_surcharge_minor)} />
          </Field>
          <Field label="Jour-/beredskapstillägg (SEK)">
            <input name="on_call_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.on_call_surcharge_minor)} />
          </Field>
          <Field label="Tillägg tung bärgning (SEK)">
            <input name="heavy_tow_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.heavy_tow_minor)} />
          </Field>
          <Field label="Bomkörning (SEK)">
            <input name="failed_trip_sek" type="number" min={0} step="1" defaultValue={sek(priceList?.failed_trip_minor)} />
          </Field>
          <Field label="Avbokningsvillkor (visas för kunden)">
            <textarea
              name="cancellation_policy"
              rows={3}
              defaultValue={String(priceList?.cancellation_policy ?? "")}
              placeholder="T.ex. Fri avbokning tills bärgaren har åkt. Därefter debiteras bomkörning."
            />
          </Field>
          <div>
            <Button type="submit">Spara priser</Button>
          </div>
        </form>
      </Card>
      <Card style={{ marginTop: 24, maxWidth: 560 }}>
        <strong>Så beräknas kundens pris</strong>
        <p style={{ opacity: 0.72, marginBottom: 0 }}>
          Grundavgift + pris per kilometer (upphämtning till destination) + eventuella kvälls-, natt- och helgtillägg.
          Är summan lägre än ert lägsta pris höjs den till lägsta priset. Kunden ser alltid att väntetid och extra
          arbete kan tillkomma. Alla priser anges inklusive moms.
        </p>
      </Card>
    </div>
  );
}
