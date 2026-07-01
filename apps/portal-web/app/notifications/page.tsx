import { Button, Card, DataTable, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { listNotificationFallbackRules, listOperationalNotifications } from "../lib/data";
import { saveFallbackRule } from "../lib/actions";
import { NoTenant, WrongTenantType, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type !== "insurance_company") return <WrongTenantType need="insurance_company" />;
  const [rules, queue] = await Promise.all([
    listNotificationFallbackRules(tenant.id),
    listOperationalNotifications(tenant.id),
  ]);

  const ruleColumns: Column<Row>[] = [
    { key: "scope", header: "Flöde", render: (r) => String(r.job_scope ?? "insurance") },
    { key: "enabled", header: "Aktiv", render: (r) => (r.enabled ? "Ja" : "Nej") },
    { key: "push", header: "Push-timeout", render: (r) => `${num(r.push_timeout_seconds)} sek` },
    { key: "attempts", header: "Pushförsök", render: (r) => num(r.push_max_attempts) },
    { key: "insurance_wave", header: "Avtalsradie", render: (r) => `${num(r.insurance_next_wave_radius_km)} km` },
    { key: "sms", header: "SMS fallback", render: (r) => (r.sms_fallback_enabled ? "Ja" : "Nej") },
    { key: "sensitive", header: "Känsligt i SMS", render: (r) => (r.expose_sensitive_data_in_sms ? "Ja" : "Nej") },
  ];
  const queueColumns: Column<Row>[] = [
    { key: "created", header: "Skapad", render: (r) => String(r.created_at ?? "").slice(0, 16).replace("T", " ") },
    { key: "channel", header: "Kanal", render: (r) => String(r.channel ?? "—") },
    { key: "template", header: "Mall", render: (r) => String(r.template_key ?? "—") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "pending")} /> },
    { key: "attempts", header: "Försök", render: (r) => num(r.attempts) },
  ];

  return (
    <div>
      <PageHeader
        title="Notiser och fallback"
        subtitle="Regler för push/SMS när uppdrag skickas till bärgningsbilar. Försäkringsuppdrag fallbackar bara inom aktiva avtal."
      />
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
        <DataTable columns={ruleColumns} rows={rules} empty="Inga fallbackregler ännu" />
        <Card>
          <h3 style={{ marginTop: 0 }}>Spara fallbackregel</h3>
          <form action={saveFallbackRule} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <label>
              Flöde
              <select name="job_scope" defaultValue="insurance">
                <option value="insurance">Försäkringsuppdrag</option>
                <option value="private">Fri bärgning</option>
                <option value="all">Alla</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" defaultChecked /> Aktiv</label>
            <label>Push-timeout sekunder<input name="push_timeout_seconds" type="number" defaultValue={120} /></label>
            <label>Max pushförsök<input name="push_max_attempts" type="number" defaultValue={2} /></label>
            <label>Försäkringsradie km<input name="insurance_next_wave_radius_km" type="number" defaultValue={30} /></label>
            <label>Fri bärgningsradie km<input name="private_wave_radius_km" type="number" defaultValue={15} /></label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="sms_fallback_enabled" defaultChecked /> SMS fallback</label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="expose_sensitive_data_in_sms" /> Tillåt känslig data i SMS</label>
            <label>Manuell granskning efter minuter<input name="manual_review_after_minutes" type="number" defaultValue={15} /></label>
            <label>
              Operativa kontakter JSON
              <textarea name="operational_contacts_json" rows={4} defaultValue={'[{"name":"Jour","phone":"+46700000000"}]'} />
            </label>
            <Button type="submit">Spara regel</Button>
          </form>
        </Card>
      </div>
      <h3 style={{ marginTop: 32 }}>Senaste notiskö</h3>
      <DataTable columns={queueColumns} rows={queue} empty="Inga köade notiser ännu" />
    </div>
  );
}
