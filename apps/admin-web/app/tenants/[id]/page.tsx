import { Card, PageHeader, Button, EmptyState } from "@roadside/web-kit";
import { getTenant } from "../../lib/data";
import { updateTenantBranding, createTenantAdmin } from "../../lib/actions";

export const dynamic = "force-dynamic";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getTenant(id);

  if (!tenant) {
    return (
      <div>
        <PageHeader title="Tenant" />
        <EmptyState title="Tenant not found" hint="It may not exist or Supabase is not configured." />
      </div>
    );
  }

  const isInsurance = tenant.type === "insurance_company";

  return (
    <div>
      <PageHeader title={tenant.name} subtitle={`${tenant.type} • ${tenant.slug}`} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Branding & case prefix</h3>
          <form action={updateTenantBranding}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="product_name">Product name</label>
            <input id="product_name" name="product_name" defaultValue={tenant.name} />
            <label htmlFor="color_primary">Primary color</label>
            <input id="color_primary" name="color_primary" placeholder="#0B5FFF" />
            <label htmlFor="case_number_prefix">Case number prefix</label>
            <input id="case_number_prefix" name="case_number_prefix" defaultValue={tenant.case_number_prefix} />
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Create admin user</h3>
          <form action={createTenantAdmin}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="full_name">Full name</label>
            <input id="full_name" name="full_name" placeholder="Anna Admin" />
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" placeholder="anna@example.com" required />
            <label htmlFor="role_key">Role</label>
            <select id="role_key" name="role_key" defaultValue={isInsurance ? "insurance_owner_admin" : "tow_owner_admin"}>
              {isInsurance ? (
                <>
                  <option value="insurance_owner_admin">Owner / Admin</option>
                  <option value="insurance_claims_handler">Claims Handler</option>
                  <option value="insurance_roadside_handler">Roadside Handler</option>
                </>
              ) : (
                <>
                  <option value="tow_owner_admin">Owner / Admin</option>
                  <option value="tow_dispatcher">Dispatcher</option>
                  <option value="tow_driver">Driver</option>
                </>
              )}
            </select>
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Create user</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
