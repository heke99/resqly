import { Card, DataTable, PageHeader, Button, Badge, type Column } from "@resqly/web-kit";
import { listTenants, type TenantRow } from "../lib/data";
import { createTenant } from "../lib/actions";

export const dynamic = "force-dynamic";

const columns: Column<TenantRow>[] = [
  { key: "name", header: "Name", render: (t) => <a href={`/tenants/${t.id}`}>{t.name}</a> },
  { key: "type", header: "Type", render: (t) => <Badge>{t.type}</Badge> },
  { key: "slug", header: "Partner path", render: (t) => <code>/partner/{t.slug}</code> },
  { key: "prefix", header: "Case prefix", render: (t) => t.case_number_prefix },
  { key: "status", header: "Status", render: (t) => t.status },
];

export default async function TenantsPage() {
  const tenants = await listTenants();
  return (
    <div>
      <PageHeader
        title="Tenants & white-label partners"
        subtitle="Create insurance companies, towing companies and partner environments with branding, rules and first admin."
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(420px, 0.9fr)", gap: 24, alignItems: "start" }}>
        <div>
          <DataTable columns={columns} rows={tenants} empty="No tenants yet" />
          <Card style={{ marginTop: 16 }}>
            <strong>Customer links</strong>
            <p style={{ opacity: 0.72, marginBottom: 0 }}>
              Resqly can run without one subdomain per insurer. Every partner gets a path like <code>app.resqly.com/partner/if</code>.
              Custom domains can be added later as premium white-label.
            </p>
          </Card>
        </div>

        <Card>
          <h3 style={{ marginTop: 0 }}>Create complete partner</h3>
          <form action={createTenant}>
            <h4>1. Core</h4>
            <label htmlFor="type">Type</label>
            <select id="type" name="type" defaultValue="insurance_company">
              <option value="insurance_company">Insurance company</option>
              <option value="tow_company">Tow company</option>
              <option value="fleet_company">Fleet company</option>
              <option value="leasing_company">Leasing company</option>
              <option value="workshop_partner">Workshop partner</option>
              <option value="platform_internal">Platform internal</option>
            </select>
            <label htmlFor="name">Legal/company name</label>
            <input id="name" name="name" placeholder="If Försäkring" required />
            <label htmlFor="slug">Partner slug</label>
            <input id="slug" name="slug" placeholder="if" required />
            <label htmlFor="case_number_prefix">Case number prefix</label>
            <input id="case_number_prefix" name="case_number_prefix" placeholder="IF" required />

            <h4>2. White-label</h4>
            <label htmlFor="product_name">Customer-facing product name</label>
            <input id="product_name" name="product_name" placeholder="If Assistans" />
            <label htmlFor="logo_url">Logo URL</label>
            <input id="logo_url" name="logo_url" placeholder="https://.../logo.svg" />
            <label htmlFor="favicon_url">Favicon URL</label>
            <input id="favicon_url" name="favicon_url" placeholder="https://.../favicon.png" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label htmlFor="color_primary">Primary</label>
                <input id="color_primary" name="color_primary" defaultValue="#0B5FFF" />
              </div>
              <div>
                <label htmlFor="color_secondary">Secondary</label>
                <input id="color_secondary" name="color_secondary" defaultValue="#1F2937" />
              </div>
              <div>
                <label htmlFor="color_background">Background</label>
                <input id="color_background" name="color_background" defaultValue="#FFFFFF" />
              </div>
            </div>
            <label htmlFor="support_phone">Support phone</label>
            <input id="support_phone" name="support_phone" placeholder="0771-..." />
            <label htmlFor="support_email">Support email</label>
            <input id="support_email" name="support_email" type="email" placeholder="support@partner.se" />
            <label htmlFor="support_url">Support URL</label>
            <input id="support_url" name="support_url" placeholder="https://partner.se/support" />
            <label htmlFor="custom_domain">Optional custom domain</label>
            <input id="custom_domain" name="custom_domain" placeholder="assistans.partner.se" />

            <h4>3. Rules</h4>
            <label><input type="checkbox" name="bankid_required_for_tow" defaultChecked /> BankID required for towing cases</label>
            <label><input type="checkbox" name="bankid_required_for_claims" defaultChecked /> BankID required for damage claims</label>
            <label><input type="checkbox" name="damage_claims_enabled" defaultChecked /> Damage claims enabled</label>
            <label><input type="checkbox" name="allow_marketplace_fallback" defaultChecked /> Allow marketplace fallback</label>
            <label><input type="checkbox" name="marketplace_enabled" /> Enable marketplace pricing/network</label>
            <label htmlFor="default_dispatch_strategy">Default dispatch strategy</label>
            <select id="default_dispatch_strategy" name="default_dispatch_strategy" defaultValue="eta_first">
              <option value="eta_first">ETA first</option>
              <option value="nearest_available">Nearest available</option>
              <option value="insurance_preferred_network">Insurance preferred network</option>
              <option value="sla_first">SLA first</option>
              <option value="cost_first">Cost first</option>
              <option value="manual_dispatch">Manual dispatch</option>
            </select>
            <label htmlFor="max_dispatch_radius_km">Max dispatch radius km</label>
            <input id="max_dispatch_radius_km" name="max_dispatch_radius_km" type="number" defaultValue={50} />

            <h4>4. Legal</h4>
            <label htmlFor="terms_of_service">Terms</label>
            <textarea id="terms_of_service" name="terms_of_service" rows={3} placeholder="Partner terms shown in customer flow." />
            <label htmlFor="privacy_policy">Privacy policy</label>
            <textarea id="privacy_policy" name="privacy_policy" rows={3} placeholder="Partner privacy text shown in customer flow." />

            <h4>5. First portal admin</h4>
            <label htmlFor="admin_full_name">Full name</label>
            <input id="admin_full_name" name="admin_full_name" placeholder="Anna Admin" />
            <label htmlFor="admin_email">Email</label>
            <input id="admin_email" name="admin_email" type="email" placeholder="anna@partner.se" />
            <label htmlFor="admin_role_key">Role</label>
            <select id="admin_role_key" name="admin_role_key" defaultValue="insurance_owner_admin">
              <option value="insurance_owner_admin">Insurance Owner/Admin</option>
              <option value="insurance_claims_handler">Insurance Claims Handler</option>
              <option value="insurance_roadside_handler">Roadside Handler</option>
              <option value="insurance_integration_manager">Insurance Integration Manager</option>
              <option value="tow_owner_admin">Tow Owner/Admin</option>
              <option value="tow_dispatcher">Tow Dispatcher</option>
              <option value="tow_driver">Tow Driver</option>
            </select>
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Create partner</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
