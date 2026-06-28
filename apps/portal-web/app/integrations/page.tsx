import { Button, Card, DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listApiClients, listWebhooks } from "../lib/data";
import { createApiKey, createWebhook } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const apiColumns: Column<Row>[] = [
  { key: "name", header: "Name", render: (r) => String(r.name ?? "") },
  { key: "last4", header: "Key", render: (r) => `••••${String(r.key_last4 ?? "")}` },
  { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
];

const hookColumns: Column<Row>[] = [
  { key: "url", header: "URL", render: (r) => String(r.url ?? "") },
  { key: "events", header: "Events", render: (r) => (Array.isArray(r.events) ? r.events.join(", ") : "") },
  { key: "active", header: "Active", render: (r) => (r.active ? "Yes" : "No") },
];

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const clients = tenant ? await listApiClients(tenant.id) : [];
  const webhooks = tenant ? await listWebhooks(tenant.id) : [];

  return (
    <div>
      <PageHeader title="API & webhooks" subtitle="Partner integration settings" />

      <h3>API keys</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start", marginBottom: 32 }}>
        <DataTable columns={apiColumns} rows={clients} empty="No API keys yet" />
        <Card>
          <h4 style={{ marginTop: 0 }}>Create API key</h4>
          <form action={createApiKey}>
            <input type="hidden" name="tenant_id" value={tenant?.id ?? ""} />
            <label htmlFor="name">Name</label>
            <input id="name" name="name" placeholder="Claims integration" />
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Generate key</Button>
            </div>
          </form>
        </Card>
      </div>

      <h3>Webhooks</h3>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={hookColumns} rows={webhooks} empty="No webhooks yet" />
        <Card>
          <h4 style={{ marginTop: 0 }}>Add webhook</h4>
          <form action={createWebhook}>
            <input type="hidden" name="tenant_id" value={tenant?.id ?? ""} />
            <label htmlFor="url">Endpoint URL</label>
            <input id="url" name="url" placeholder="https://example.com/hooks" />
            <label htmlFor="events">Events (comma-separated)</label>
            <input id="events" name="events" placeholder="tow.accepted, tow.completed" />
            <div style={{ marginTop: 16 }}>
              <Button type="submit">Add webhook</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
