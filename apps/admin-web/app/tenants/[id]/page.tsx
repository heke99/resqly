import { Card, PageHeader, Button, EmptyState, Badge, DataTable, type Column } from "@resqly/web-kit";
import { getTenant } from "../../lib/data";
import { updateTenantBranding, createTenantAdmin } from "../../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function bool(value: unknown): boolean {
  return value === true;
}

const domainColumns: Column<Row>[] = [
  { key: "domain", header: "Domän", render: (r) => String(r.domain ?? "—") },
  { key: "primary", header: "Primär", render: (r) => (r.is_primary ? "Ja" : "Nej") },
  { key: "verified", header: "Verifierad", render: (r) => (r.verified ? "Ja" : "Nej") },
];

const adminColumns: Column<Row>[] = [
  {
    key: "name",
    header: "Användare",
    render: (r) => {
      const profile = r.profile as { email?: string; full_name?: string } | null;
      return profile?.full_name || profile?.email || String(r.user_id ?? "—");
    },
  },
  {
    key: "email",
    header: "E-post",
    render: (r) => {
      const profile = r.profile as { email?: string } | null;
      return profile?.email ?? "—";
    },
  },
  {
    key: "role",
    header: "Roll",
    render: (r) => (Array.isArray(r.roles) ? r.roles.join(", ") : "—"),
  },
];

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant(id);

  if (!tenant) {
    return (
      <div>
        <PageHeader title="Organisation" />
        <EmptyState title="Organisationen hittades inte" hint="Organisationen finns inte eller har tagits bort." />
      </div>
    );
  }

  const isInsurance = tenant.type === "insurance_company";
  const isTow = tenant.type === "tow_company";
  const branding = tenant.branding ?? {};
  const theme = tenant.theme ?? {};
  const settings = tenant.settings ?? {};
  const flags = tenant.flags ?? {};
  const legal = tenant.legal ?? {};
  const customerBase = process.env.NEXT_PUBLIC_CUSTOMER_WEB_URL ?? "https://app.resqly.se";
  const customerLink = `${customerBase}/partner/${tenant.slug}`;
  const casePreview = `${tenant.case_number_prefix}-${new Date().getFullYear()}-000001`;
  const productName = str(branding.product_name, tenant.name);
  const primary = str(theme.color_primary, "#0B5FFF");

  return (
    <div>
      <PageHeader
        title={tenant.name}
        subtitle={`${tenant.type === "insurance_company" ? "Försäkringsbolag" : tenant.type === "tow_company" ? "Bärgningsbolag" : "Organisation"} • ${tenant.slug} • ${tenant.status === "active" ? "Aktiv" : tenant.status}`}
        actions={<a href={customerLink} target="_blank" rel="noreferrer">Öppna kundlänken</a>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 24 }}>
        <Card><div style={{ opacity: 0.7 }}>Partnerlänk</div><strong>/partner/{tenant.slug}</strong></Card>
        <Card><div style={{ opacity: 0.7 }}>Ärendenummer (exempel)</div><strong>{casePreview}</strong></Card>
        <Card><div style={{ opacity: 0.7 }}>BankID vid bärgning</div><strong>{bool(settings.bankid_required_for_tow) ? "Krävs" : "Valfritt"}</strong></Card>
        <Card><div style={{ opacity: 0.7 }}>Skadeärenden</div><strong>{bool(flags.damage_claims_enabled) ? "Aktiverat" : "Avstängt"}</strong></Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Förhandsvisning av varumärke</h3>
          <div style={{ borderRadius: 18, padding: 20, background: str(theme.color_background, "#fff"), border: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {branding.logo_url ? <img src={str(branding.logo_url)} alt="Logo" style={{ width: 44, height: 44, objectFit: "contain" }} /> : <div style={{ width: 44, height: 44, borderRadius: 12, background: primary }} />}
              <div>
                <strong style={{ color: primary, fontSize: 18 }}>{productName}</strong>
                <div style={{ opacity: 0.7 }}>Kundens ärendeflöde</div>
              </div>
            </div>
            <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: primary, color: str(theme.color_on_primary, "#fff"), fontWeight: 700 }}>
              Starta bärgning
            </div>
            <p style={{ marginBottom: 0, opacity: 0.75 }}>Support: {str(branding.support_phone, "inte angivet")}</p>
          </div>
          <p style={{ opacity: 0.7 }}>Kundlänk: <a href={customerLink} target="_blank">{customerLink}</a></p>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Redigera varumärke, regler och juridik</h3>
          <form action={updateTenantBranding}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="product_name">Produktnamn</label>
            <input id="product_name" name="product_name" defaultValue={productName} />
            <label htmlFor="logo_url">Logotyp (länk)</label>
            <input id="logo_url" name="logo_url" defaultValue={str(branding.logo_url)} />
            <label htmlFor="favicon_url">Webbikon (länk)</label>
            <input id="favicon_url" name="favicon_url" defaultValue={str(branding.favicon_url)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div><label htmlFor="color_primary">Huvudfärg</label><input id="color_primary" name="color_primary" defaultValue={primary} /></div>
              <div><label htmlFor="color_secondary">Sekundärfärg</label><input id="color_secondary" name="color_secondary" defaultValue={str(theme.color_secondary, "#1F2937")} /></div>
              <div><label htmlFor="color_background">Bakgrund</label><input id="color_background" name="color_background" defaultValue={str(theme.color_background, "#FFFFFF")} /></div>
            </div>
            <label htmlFor="case_number_prefix">Ärendenummerprefix</label>
            <input id="case_number_prefix" name="case_number_prefix" defaultValue={tenant.case_number_prefix} />
            <label htmlFor="support_phone">Supporttelefon</label>
            <input id="support_phone" name="support_phone" defaultValue={str(branding.support_phone)} />
            <label htmlFor="support_email">Support-e-post</label>
            <input id="support_email" name="support_email" defaultValue={str(branding.support_email)} />
            <label htmlFor="support_url">Supportsida (länk)</label>
            <input id="support_url" name="support_url" defaultValue={str(branding.support_url)} />
            <label htmlFor="custom_domain">Egen domän</label>
            <input id="custom_domain" name="custom_domain" placeholder="assistans.partner.se" defaultValue={str(tenant.domains[0]?.domain)} />
            <label><input type="checkbox" name="bankid_required_for_tow" defaultChecked={bool(settings.bankid_required_for_tow)} /> BankID krävs vid bärgning</label>
            <label><input type="checkbox" name="bankid_required_for_claims" defaultChecked={bool(settings.bankid_required_for_claims)} /> BankID krävs vid skadeärenden</label>
            <label><input type="checkbox" name="damage_claims_enabled" defaultChecked={bool(flags.damage_claims_enabled)} /> Skadeärenden aktiverade</label>
            <label><input type="checkbox" name="allow_marketplace_fallback" defaultChecked={bool(settings.allow_marketplace_fallback)} /> Tillåt fri bärgning som reserv (endast privata ärenden)</label>
            <label><input type="checkbox" name="marketplace_enabled" defaultChecked={bool(flags.marketplace_enabled)} /> Fri bärgning aktiverad</label>
            <label htmlFor="default_dispatch_strategy">Hur uppdrag fördelas</label>
            <select id="default_dispatch_strategy" name="default_dispatch_strategy" defaultValue={str(settings.default_dispatch_strategy, "eta_first")}>
              <option value="eta_first">Kortast ankomsttid först</option>
              <option value="nearest_available">Närmast tillgänglig först</option>
              <option value="insurance_preferred_network">Avtalade partners först</option>
              <option value="sla_first">Tidsgräns först</option>
              <option value="cost_first">Lägst kostnad först</option>
              <option value="manual_dispatch">Manuell tilldelning</option>
            </select>
            <label htmlFor="max_dispatch_radius_km">Största sökradie (km)</label>
            <input id="max_dispatch_radius_km" name="max_dispatch_radius_km" defaultValue={String(settings.max_dispatch_radius_km ?? 50)} />
            <label htmlFor="terms_of_service">Allmänna villkor</label>
            <textarea id="terms_of_service" name="terms_of_service" rows={3} defaultValue={str(legal.terms_of_service)} />
            <label htmlFor="privacy_policy">Integritetspolicy</label>
            <textarea id="privacy_policy" name="privacy_policy" rows={3} defaultValue={str(legal.privacy_policy)} />
            <div style={{ marginTop: 16 }}><Button type="submit">Spara organisation</Button></div>
          </form>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Bjud in portalanvändare</h3>
          <form action={createTenantAdmin}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="full_name">Namn</label>
            <input id="full_name" name="full_name" placeholder="Anna Admin" />
            <label htmlFor="email">E-post</label>
            <input id="email" name="email" type="email" placeholder="anna@example.com" required />
            <label htmlFor="role_key">Roll</label>
            <select id="role_key" name="role_key" defaultValue={isTow ? "tow_owner_admin" : "insurance_owner_admin"}>
              {isInsurance ? (
                <>
                  <option value="insurance_owner_admin">Ägare / Administratör</option>
                  <option value="insurance_claims_handler">Skadehandläggare</option>
                  <option value="insurance_roadside_handler">Assistanshandläggare</option>
                  <option value="insurance_integration_manager">Integrationsansvarig</option>
                  <option value="insurance_viewer">Läsbehörighet</option>
                </>
              ) : (
                <>
                  <option value="tow_owner_admin">Ägare / Administratör</option>
                  <option value="tow_dispatcher">Trafikledare</option>
                  <option value="tow_driver">Förare</option>
                  <option value="tow_vehicle_manager">Fordonsansvarig</option>
                  <option value="tow_viewer">Läsbehörighet</option>
                </>
              )}
            </select>
            <div style={{ marginTop: 16 }}><Button type="submit">Skicka inbjudan</Button></div>
          </form>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Sammanfattning</h3>
          <p><Badge>{tenant.type === "insurance_company" ? "Försäkringsbolag" : tenant.type === "tow_company" ? "Bärgningsbolag" : "Organisation"}</Badge></p>
          <p><strong>Portal:</strong> {process.env.NEXT_PUBLIC_PORTAL_WEB_URL ?? "https://portal.resqly.se"}</p>
          <p><strong>Integrationsadress:</strong> {process.env.NEXT_PUBLIC_API_URL ?? "https://api.resqly.se"}</p>
          <p><strong>Kundlänk:</strong><br /><a href={customerLink}>{customerLink}</a></p>
          <p><strong>Ärendenummer:</strong> {casePreview}</p>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <DataTable columns={domainColumns} rows={tenant.domains} empty="Inga egna domäner ännu" />
        <DataTable columns={adminColumns} rows={tenant.admins} empty="Inga portalanvändare ännu" />
      </div>
    </div>
  );
}
