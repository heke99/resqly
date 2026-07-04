import { Button, Card, DataTable, KpiGrid, PageHeader, StatCard, StatusChip, type Column } from "@resqly/web-kit";
import { evaluateProductionReadiness } from "@resqly/utils";
import {
  listIntegrationFailures,
  listManualHelpCases,
  listNotificationFailures,
  listPushFailures,
} from "../lib/data";
import { resolveManualReview, retryIntegrationDelivery, retryOperationalNotification } from "../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function formatTime(value: unknown): string {
  const s = String(value ?? "");
  return s ? s.slice(0, 16).replace("T", " ") : "—";
}

export default async function OperationsPage() {
  const [manualHelp, notificationFailures, pushFailures, integrationFailures] = await Promise.all([
    listManualHelpCases(),
    listNotificationFailures(),
    listPushFailures(),
    listIntegrationFailures(),
  ]);

  // Platform-level configuration status — shown only here, never to end users.
  const config = evaluateProductionReadiness({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    encryptionKey: process.env.ENCRYPTION_KEY,
    bankidProvider: process.env.BANKID_PROVIDER,
    ticApiKey: process.env.TIC_API_KEY,
    googleMapsServerKey: process.env.GOOGLE_MAPS_SERVER_KEY,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    expoPushEnabled: process.env.EXPO_PUSH_ENABLED !== "false",
    smsEnabled: process.env.SMS_ENABLED === "true",
    smsApiKey: process.env.SMS_API_KEY,
  });

  const manualColumns: Column<Row>[] = [
    { key: "created", header: "Skapat", render: (r) => formatTime(r.created_at) },
    { key: "reason", header: "Orsak", render: (r) => String(r.reason ?? "—") },
    { key: "job", header: "Uppdrag", render: (r) => String(r.tow_job_id ?? "—").slice(0, 8).toUpperCase() },
    {
      key: "resolve",
      header: "Åtgärd",
      render: (r) => (
        <form action={resolveManualReview} style={{ margin: 0 }}>
          <input type="hidden" name="review_id" value={String(r.id)} />
          <button type="submit" style={{ cursor: "pointer" }}>Markera som löst</button>
        </form>
      ),
    },
  ];

  const notificationColumns: Column<Row>[] = [
    { key: "created", header: "Skapat", render: (r) => formatTime(r.created_at) },
    { key: "channel", header: "Kanal", render: (r) => (String(r.channel) === "sms" ? "SMS" : String(r.channel ?? "—")) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
    { key: "error", header: "Orsak", render: (r) => String(r.last_error ?? "—").slice(0, 120) },
    {
      key: "retry",
      header: "Åtgärd",
      render: (r) => (
        <form action={retryOperationalNotification} style={{ margin: 0 }}>
          <input type="hidden" name="notification_id" value={String(r.id)} />
          <button type="submit" style={{ cursor: "pointer" }}>Försök igen</button>
        </form>
      ),
    },
  ];

  const pushColumns: Column<Row>[] = [
    { key: "updated", header: "Senast", render: (r) => formatTime(r.updated_at) },
    { key: "job", header: "Uppdrag", render: (r) => String(r.tow_job_id ?? "—").slice(0, 8).toUpperCase() },
    { key: "attempts", header: "Försök", render: (r) => String(r.push_attempts ?? 0) },
    { key: "error", header: "Orsak", render: (r) => String(r.push_error ?? "—").slice(0, 120) },
  ];

  const integrationColumns: Column<Row>[] = [
    { key: "created", header: "Skapat", render: (r) => formatTime(r.created_at) },
    { key: "event", header: "Händelse", render: (r) => String(r.event ?? "—") },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
    { key: "attempts", header: "Försök", render: (r) => String(r.attempts ?? 0) },
    { key: "error", header: "Orsak", render: (r) => String(r.last_error ?? "—").slice(0, 120) },
    {
      key: "retry",
      header: "Åtgärd",
      render: (r) => (
        <form action={retryIntegrationDelivery} style={{ margin: 0 }}>
          <input type="hidden" name="delivery_id" value={String(r.id)} />
          <Button type="submit">Försök igen</Button>
        </form>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Drift och åtgärder"
        subtitle="Ärenden som behöver hjälp, misslyckade notiser och integrationsfel — med möjlighet att åtgärda direkt."
      />
      <KpiGrid>
        <StatCard label="Behöver hjälp" value={manualHelp.length} />
        <StatCard label="Misslyckade notiser" value={notificationFailures.length} />
        <StatCard label="Misslyckade pushar" value={pushFailures.length} />
        <StatCard label="Integrationsfel" value={integrationFailures.length} />
      </KpiGrid>

      <Card style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Plattformens konfiguration</h3>
        <p style={{ opacity: 0.72 }}>
          Status: {config.ready ? "Redo för drift" : "Inte redo för drift — åtgärda punkterna nedan."}
        </p>
        <ul style={{ margin: 0 }}>
          {config.items.map((item) => (
            <li key={item.key}>
              {item.label}: {item.ready ? "Klar" : item.required ? "Behöver åtgärdas" : "Inte konfigurerad (valfri)"}
            </li>
          ))}
        </ul>
      </Card>

      <h3 style={{ marginTop: 24 }}>Behöver hjälp</h3>
      <DataTable columns={manualColumns} rows={manualHelp} empty="Inga ärenden behöver hjälp just nu" />

      <h3 style={{ marginTop: 24 }}>Misslyckade notiser (reservkanaler)</h3>
      <DataTable columns={notificationColumns} rows={notificationFailures} empty="Inga misslyckade notiser" />

      <h3 style={{ marginTop: 24 }}>Misslyckade pushnotiser till förare</h3>
      <DataTable columns={pushColumns} rows={pushFailures} empty="Inga misslyckade pushnotiser" />

      <h3 style={{ marginTop: 24 }}>Integrationsfel</h3>
      <DataTable columns={integrationColumns} rows={integrationFailures} empty="Inga integrationsfel" />
    </div>
  );
}
