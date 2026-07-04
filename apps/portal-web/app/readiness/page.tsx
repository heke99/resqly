import { Card, DataTable, KpiGrid, PageHeader, StatCard, StatusChip, type Column } from "@resqly/web-kit";
import { getActiveTenant } from "../lib/tenant";
import { getInsurerProductionReadiness, getTowCompanyProductionReadiness } from "../lib/data";
import { NoTenant, num } from "../lib/ui";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  if (!tenant) return <NoTenant />;
  if (tenant.type === "tow_company") return <TowReadiness tenantId={tenant.id} />;
  const readiness = await getInsurerProductionReadiness(tenant.id);
  const blockers = Array.isArray(readiness?.blockers) ? (readiness?.blockers as string[]) : [];

  const rows: Row[] = [
    { item: "White-label branding", ok: readiness?.has_branding, detail: readiness?.has_branding ? "Klar" : "Saknas" },
    { item: "Tema/färg", ok: readiness?.has_theme, detail: readiness?.has_theme ? "Klar" : "Saknas" },
    { item: "Juridiska versioner", ok: num(readiness?.active_legal_versions) >= 5 || (readiness?.has_simple_terms && readiness?.has_simple_privacy), detail: `${num(readiness?.active_legal_versions)} aktiva versioner` },
    { item: "Aktiva bärgaravtal", ok: num(readiness?.active_agreements) > 0, detail: `${num(readiness?.active_agreements)} avtal` },
    { item: "Behöriga bärgningsbilar", ok: num(readiness?.eligible_tow_vehicles) > 0, detail: `${num(readiness?.eligible_tow_vehicles)} bilar` },
    { item: "Notis/SMS fallback", ok: num(readiness?.enabled_fallback_rules) > 0, detail: `${num(readiness?.enabled_fallback_rules)} regler` },
    { item: "BankID för skadeärende", ok: readiness?.bankid_required_for_claims, detail: readiness?.bankid_required_for_claims ? "Krävs" : "Avstängt" },
    { item: "BankID för bärgning", ok: readiness?.bankid_required_for_tow, detail: readiness?.bankid_required_for_tow ? "Krävs" : "Avstängt" },
    { item: "Ärendenummerprefix", ok: readiness?.has_case_prefix, detail: String(readiness?.case_number_prefix ?? "Saknas") },
  ];

  const columns: Column<Row>[] = [
    { key: "item", header: "Kontroll", render: (r) => String(r.item) },
    { key: "ok", header: "Status", render: (r) => <StatusChip status={r.ok ? "klar" : "saknas"} tone={r.ok ? "success" : "warning"} /> },
    { key: "detail", header: "Detalj", render: (r) => String(r.detail) },
  ];

  return (
    <div>
      <PageHeader
        title="Produktionsklar"
        subtitle="Checklistan som ska vara grön innan betalande pilot eller skarp försäljning till försäkringsbolag."
        actions={<StatusChip status={readiness?.ready_for_paid_pilot ? "Redo för pilot" : "Blockerad"} tone={readiness?.ready_for_paid_pilot ? "success" : "warning"} />}
      />
      <KpiGrid>
        <StatCard label="Aktiva avtal" value={num(readiness?.active_agreements)} />
        <StatCard label="Behöriga bärgningsbilar" value={num(readiness?.eligible_tow_vehicles)} />
        <StatCard label="Juridiska versioner" value={num(readiness?.active_legal_versions)} />
        <StatCard label="Fallbackregler" value={num(readiness?.enabled_fallback_rules)} />
        <StatCard label="Åtkomstnycklar" value={num(readiness?.active_api_clients)} />
        <StatCard label="Integrationer" value={num(readiness?.active_webhooks)} />
      </KpiGrid>
      <Card style={{ marginTop: 24, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Behöver åtgärdas</h3>
        {blockers.length ? (
          <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        ) : (
          <p>Allt är klart — inget behöver åtgärdas.</p>
        )}
      </Card>
      <DataTable columns={columns} rows={rows} empty="Ingen data hittades" />
    </div>
  );
}

async function TowReadiness({ tenantId }: { tenantId: string }) {
  const readiness = await getTowCompanyProductionReadiness(tenantId);
  const blockers = Array.isArray(readiness?.blockers) ? (readiness?.blockers as string[]) : [];

  const rows: Row[] = [
    { item: "Bolaget aktivt", ok: readiness?.company_active, detail: readiness?.company_active ? "Klar" : "Inaktivt" },
    { item: "Kontaktuppgifter för support", ok: readiness?.has_support_contact, detail: readiness?.has_support_contact ? "Klar" : "Saknas" },
    { item: "Förare", ok: num(readiness?.active_drivers) > 0, detail: `${num(readiness?.active_drivers)} aktiva förare` },
    { item: "Förare kan logga in", ok: num(readiness?.loginable_drivers) > 0, detail: `${num(readiness?.loginable_drivers)} med konto` },
    { item: "Aktiv bärgningsbil", ok: num(readiness?.active_vehicles) > 0, detail: `${num(readiness?.active_vehicles)} bilar` },
    { item: "Notiser registrerade i förar-appen", ok: num(readiness?.push_devices) > 0, detail: `${num(readiness?.push_devices)} enheter` },
    {
      item: "Avtal eller fri bärgning",
      ok: num(readiness?.active_agreements) > 0 || readiness?.accepts_private_jobs,
      detail: `${num(readiness?.active_agreements)} avtal${readiness?.accepts_private_jobs ? " · fri bärgning aktiv" : ""}`,
    },
    { item: "Slutrapporter", ok: true, detail: `${num(readiness?.completed_reports)} inskickade` },
  ];

  const columns: Column<Row>[] = [
    { key: "item", header: "Kontroll", render: (r) => String(r.item) },
    { key: "ok", header: "Status", render: (r) => <StatusChip status={r.ok ? "klar" : "saknas"} tone={r.ok ? "success" : "warning"} /> },
    { key: "detail", header: "Detalj", render: (r) => String(r.detail) },
  ];

  return (
    <div>
      <PageHeader
        title="Redo för drift"
        subtitle="Checklistan som ska vara grön innan bolaget tar emot skarpa uppdrag."
        actions={
          <StatusChip
            status={readiness?.ready_for_live_operation ? "Redo för drift" : "Behöver åtgärdas"}
            tone={readiness?.ready_for_live_operation ? "success" : "warning"}
          />
        }
      />
      <Card style={{ marginTop: 8, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Behöver åtgärdas</h3>
        {blockers.length ? <ul>{blockers.map((b) => <li key={b}>{b}</li>)}</ul> : <p>Allt är klart — inget behöver åtgärdas.</p>}
      </Card>
      <DataTable columns={columns} rows={rows} empty="Ingen data hittades" />
    </div>
  );
}
