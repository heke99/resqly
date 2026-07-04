import { Card, DataTable, PageHeader, Button, Badge, type Column } from "@resqly/web-kit";
import { listTenants, type TenantRow } from "../lib/data";
import { createTenant } from "../lib/actions";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  insurance_company: "Försäkringsbolag",
  tow_company: "Bärgningsbolag",
  fleet_company: "Fordonsflotta",
  leasing_company: "Leasingbolag",
  workshop_partner: "Verkstadspartner",
  platform_internal: "Plattform (intern)",
};

const columns: Column<TenantRow>[] = [
  { key: "name", header: "Namn", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Typ", render: (t) => <Badge>{TYPE_LABELS[t.type] ?? t.type}</Badge> },
  { key: "slug", header: "Partnerlänk", render: (t) => <code>/partner/{t.slug}</code> },
  { key: "prefix", header: "Ärendeprefix", render: (t) => t.case_number_prefix },
  { key: "status", header: "Status", render: (t) => (t.status === "active" ? "Aktiv" : t.status) },
];

export default async function TenantsPage() {
  const tenants = await listTenants();
  return (
    <div>
      <PageHeader
        title="Organisationer och partners"
        subtitle="Skapa försäkringsbolag, bärgningsbolag och partnermiljöer med varumärke, regler och första administratör."
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(420px, 0.9fr)", gap: 24, alignItems: "start" }}>
        <div>
          <DataTable columns={columns} rows={tenants} empty="Inga organisationer ännu" />
          <Card style={{ marginTop: 16 }}>
            <strong>Kundlänkar</strong>
            <p style={{ opacity: 0.72, marginBottom: 0 }}>
              Varje partner får en egen kundlänk som <code>app.resqly.se/partner/if</code>. Egna domäner kan läggas till senare.
            </p>
          </Card>
        </div>

        <Card>
          <h3 style={{ marginTop: 0 }}>Skapa komplett partner</h3>
          <form action={createTenant}>
            <h4>1. Grunduppgifter</h4>
            <label htmlFor="type">Typ</label>
            <select id="type" name="type" defaultValue="insurance_company">
              <option value="insurance_company">Försäkringsbolag</option>
              <option value="tow_company">Bärgningsbolag</option>
              <option value="fleet_company">Fordonsflotta</option>
              <option value="leasing_company">Leasingbolag</option>
              <option value="workshop_partner">Verkstadspartner</option>
              <option value="platform_internal">Plattform (intern)</option>
            </select>
            <label htmlFor="name">Bolagsnamn</label>
            <input id="name" name="name" placeholder="If Försäkring" required />
            <label htmlFor="slug">Partnerlänk (kortnamn)</label>
            <input id="slug" name="slug" placeholder="if" required />
            <label htmlFor="case_number_prefix">Ärendenummerprefix</label>
            <input id="case_number_prefix" name="case_number_prefix" placeholder="IF" required />

            <h4>2. Varumärke</h4>
            <label htmlFor="product_name">Produktnamn mot kund</label>
            <input id="product_name" name="product_name" placeholder="If Assistans" />
            <label htmlFor="logo_url">Logotyp (länk)</label>
            <input id="logo_url" name="logo_url" placeholder="https://.../logo.svg" />
            <label htmlFor="favicon_url">Webbikon (länk)</label>
            <input id="favicon_url" name="favicon_url" placeholder="https://.../favicon.png" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label htmlFor="color_primary">Huvudfärg</label>
                <input id="color_primary" name="color_primary" defaultValue="#0B5FFF" />
              </div>
              <div>
                <label htmlFor="color_secondary">Sekundärfärg</label>
                <input id="color_secondary" name="color_secondary" defaultValue="#1F2937" />
              </div>
              <div>
                <label htmlFor="color_background">Bakgrund</label>
                <input id="color_background" name="color_background" defaultValue="#FFFFFF" />
              </div>
            </div>
            <label htmlFor="support_phone">Supporttelefon</label>
            <input id="support_phone" name="support_phone" placeholder="0771-..." />
            <label htmlFor="support_email">Support-e-post</label>
            <input id="support_email" name="support_email" type="email" placeholder="support@partner.se" />
            <label htmlFor="support_url">Supportsida (länk)</label>
            <input id="support_url" name="support_url" placeholder="https://partner.se/support" />
            <label htmlFor="custom_domain">Egen domän (valfritt)</label>
            <input id="custom_domain" name="custom_domain" placeholder="assistans.partner.se" />

            <h4>3. Regler</h4>
            <label><input type="checkbox" name="bankid_required_for_tow" defaultChecked /> BankID krävs vid bärgningsärenden</label>
            <label><input type="checkbox" name="bankid_required_for_claims" defaultChecked /> BankID krävs vid skadeärenden</label>
            <label><input type="checkbox" name="damage_claims_enabled" defaultChecked /> Skadeärenden aktiverade</label>
            <label><input type="checkbox" name="allow_marketplace_fallback" defaultChecked /> Tillåt fri bärgning som reserv (endast privata ärenden)</label>
            <label><input type="checkbox" name="marketplace_enabled" /> Aktivera fri bärgning</label>
            <label htmlFor="default_dispatch_strategy">Hur uppdrag fördelas</label>
            <select id="default_dispatch_strategy" name="default_dispatch_strategy" defaultValue="eta_first">
              <option value="eta_first">Kortast ankomsttid först</option>
              <option value="nearest_available">Närmast tillgänglig först</option>
              <option value="insurance_preferred_network">Avtalade partners först</option>
              <option value="sla_first">Tidsgräns först</option>
              <option value="cost_first">Lägst kostnad först</option>
              <option value="manual_dispatch">Manuell tilldelning</option>
            </select>
            <label htmlFor="max_dispatch_radius_km">Största sökradie (km)</label>
            <input id="max_dispatch_radius_km" name="max_dispatch_radius_km" type="number" defaultValue={50} />

            <h4>4. Juridik</h4>
            <label htmlFor="terms_of_service">Allmänna villkor</label>
            <textarea id="terms_of_service" name="terms_of_service" rows={3} placeholder="Villkor som visas för kunden i ärendeflödet." />
            <label htmlFor="privacy_policy">Integritetspolicy</label>
            <textarea id="privacy_policy" name="privacy_policy" rows={3} placeholder="Integritetstext som visas för kunden i ärendeflödet." />

            <h4>5. Första administratören</h4>
            <label htmlFor="admin_full_name">Namn</label>
            <input id="admin_full_name" name="admin_full_name" placeholder="Anna Admin" />
            <label htmlFor="admin_email">E-post</label>
            <input id="admin_email" name="admin_email" type="email" placeholder="anna@partner.se" />
            <label htmlFor="admin_role_key">Roll</label>
            <select id="admin_role_key" name="admin_role_key" defaultValue="insurance_owner_admin">
              <option value="insurance_owner_admin">Försäkring: Ägare/Administratör</option>
              <option value="insurance_claims_handler">Försäkring: Skadehandläggare</option>
              <option value="insurance_roadside_handler">Försäkring: Assistanshandläggare</option>
              <option value="insurance_integration_manager">Försäkring: Integrationsansvarig</option>
              <option value="tow_owner_admin">Bärgning: Ägare/Administratör</option>
              <option value="tow_dispatcher">Bärgning: Trafikledare</option>
              <option value="tow_driver">Bärgning: Förare</option>
            </select>
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Skapa partner</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
