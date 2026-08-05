import { Button, Card, DataTable, PageHeader, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listApiClients, listWebhooks } from "../lib/data";
import { consumeIntegrationReveal, createApiKey, createWebhook } from "../lib/actions";
import { NoTenant } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const apiColumns: Column<Row>[] = [
  { key: "name", header: "Namn", render: (r) => String(r.name ?? "") },
  { key: "last4", header: "Nyckel", render: (r) => `••••${String(r.key_last4 ?? "")}` },
  { key: "scopes", header: "Behörigheter", render: (r) => (Array.isArray(r.scopes) ? r.scopes.join(", ") : "") },
  { key: "active", header: "Aktiv", render: (r) => (r.active ? "Ja" : "Nej") },
];

const hookColumns: Column<Row>[] = [
  { key: "url", header: "Mottagaradress", render: (r) => String(r.url ?? "") },
  { key: "events", header: "Händelser", render: (r) => (Array.isArray(r.events) ? r.events.join(", ") : "") },
  { key: "active", header: "Aktiv", render: (r) => (r.active ? "Ja" : "Nej") },
];

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  const clients = await listApiClients(tenant.id);
  const webhooks = await listWebhooks(tenant.id);
  const revealToken = typeof sp.reveal === "string" ? sp.reveal : null;
  const reveal = revealToken ? await consumeIntegrationReveal(tenant.id, revealToken) : null;
  const newKey = reveal?.kind === "api_key" ? reveal.secret : null;
  const webhookSecret = reveal?.kind === "webhook_secret" ? reveal.secret : null;

  return (
    <div>
      <PageHeader title="Integrationer" subtitle="Åtkomstnycklar och händelseutskick till era egna system" />
      {newKey ? (
        <Card style={{ border: "2px solid var(--rs-color-success)", marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Kopiera åtkomstnyckeln nu</h3>
          <p style={{ opacity: 0.72 }}>Nyckeln visas bara en gång. Spara den säkert — den kan inte visas igen.</p>
          <code style={{ display: "block", overflowWrap: "anywhere", padding: 12, background: "rgba(0,0,0,0.06)", borderRadius: 8 }}>{newKey}</code>
        </Card>
      ) : null}
      {webhookSecret ? (
        <Card style={{ border: "2px solid var(--rs-color-success)", marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>Kopiera signeringshemligheten nu</h3>
          <p style={{ opacity: 0.72 }}>Hemligheten visas bara en gång och används för att verifiera x-resqly-signature.</p>
          <code style={{ display: "block", overflowWrap: "anywhere", padding: 12, background: "rgba(0,0,0,0.06)", borderRadius: 8 }}>{webhookSecret}</code>
        </Card>
      ) : null}

      <h3>Åtkomstnycklar</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start", marginBottom: 32 }}>
        <DataTable columns={apiColumns} rows={clients} empty="Inga åtkomstnycklar ännu" />
        <Card>
          <h4 style={{ marginTop: 0 }}>Skapa åtkomstnyckel</h4>
          <form action={createApiKey}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="name">Namn</label>
            <input id="name" name="name" placeholder="Skadesystem-integration" />
            <fieldset style={{ border: 0, padding: 0, marginTop: 16 }}>
              <legend style={{ fontWeight: 600, marginBottom: 8 }}>Behörigheter</legend>
              {[
                ["incidents:read", "Läsa ärenden"],
                ["incidents:write", "Skapa och uppdatera ärenden"],
                ["tow:read", "Läsa bärgningsuppdrag"],
                ["tow:write", "Uppdatera bärgningsuppdrag"],
                ["eta:read", "Beräkna och läsa ETA"],
                ["dispatch:write", "Starta dispatch"],
                ["tenant:read", "Läsa organisationsinställningar"],
                ["tenant:write", "Ändra organisationsinställningar"],
              ].map(([value, label]) => (
                <label key={value} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <input type="checkbox" name="scopes" value={value} defaultChecked={value !== "tenant:write"} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <div style={{ marginTop: 16 }}><Button type="submit">Skapa nyckel</Button></div>
          </form>
        </Card>
      </div>

      <h3>Händelseutskick</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>
        <DataTable columns={hookColumns} rows={webhooks} empty="Inga integrationer ännu" />
        <Card>
          <h4 style={{ marginTop: 0 }}>Lägg till integration</h4>
          <p style={{ opacity: 0.72, marginTop: 0 }}>
            Händelser skickas signerade till er mottagaradress när ärenden och uppdrag uppdateras.
          </p>
          <form action={createWebhook}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label htmlFor="url">Mottagaradress (HTTPS)</label>
            <input id="url" name="url" placeholder="https://example.com/hooks" />
            <label htmlFor="events">Händelser (kommaseparerade)</label>
            <input id="events" name="events" placeholder="tow.accepted, tow.completed" />
            <div style={{ marginTop: 16 }}><Button type="submit">Lägg till</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
