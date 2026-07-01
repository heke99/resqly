import { Badge, Button, Card, EmptyState, PageHeader, StatusChip } from "@resqly/web-kit";
import { getActiveTenant } from "../../lib/tenant";
import {
  getBankidStatus,
  getIncident,
  getIncidentEvidence,
  getIncidentTowJob,
  getInsuranceCaseConsole,
  getLatestEta,
} from "../../lib/data";
import { approveClaim, rejectClaim, requestMoreInfo } from "../../lib/actions";
import { formatSeconds, num } from "../../lib/ui";

export const dynamic = "force-dynamic";

export default async function CaseDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = await getActiveTenant(sp);
  const incident = tenant ? await getIncident(tenant.id, id) : null;

  if (!incident || !tenant) {
    return (
      <div>
        <PageHeader title="Ärende" />
        <EmptyState title="Ärendet hittades inte" hint="Det kan tillhöra en annan organisation." />
      </div>
    );
  }

  const [consoleRow, bankid, evidence, job] = await Promise.all([
    getInsuranceCaseConsole(tenant.id, id),
    getBankidStatus(tenant.id, id),
    getIncidentEvidence(tenant.id, id),
    getIncidentTowJob(tenant.id, id),
  ]);
  const eta = job ? await getLatestEta(tenant.id, String(job.id)) : null;

  return (
    <div>
      <PageHeader
        title={String(incident.case_number ?? id)}
        subtitle={`${String(consoleRow?.incident_type ?? incident.type).replaceAll("_", " ")} • ${String(consoleRow?.next_action_label ?? incident.status)}`}
        actions={<Badge>{bankid.verified ? "BankID verifierat" : "Väntar på BankID"}</Badge>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Kund och fordon</h3>
          <p>Kund: {String(consoleRow?.customer_name ?? consoleRow?.customer_email ?? "—")}</p>
          <p>Telefon: {String(consoleRow?.customer_phone ?? "—")}</p>
          <p>Fordon: {String(consoleRow?.registration_number ?? "—")}</p>
          <p>Bil: {[consoleRow?.make, consoleRow?.model].filter(Boolean).join(" ") || "—"}</p>
          <p>Försäkringsbolag: {String(consoleRow?.insurance_company_name ?? tenant.name)}</p>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Ärendeunderlag</h3>
          <p>Status: <StatusChip status={String(consoleRow?.incident_status ?? incident.status)} /></p>
          <p>Skada/problem: {String(consoleRow?.damage_type ?? consoleRow?.problem_type ?? "—").replaceAll("_", " ")}</p>
          <p>Körbar: {incident.is_drivable ? "Ja" : "Nej/okänt"}</p>
          <p>Beskrivning: {String(consoleRow?.description ?? incident.description ?? "—")}</p>
          <p>Bilagor: {num(consoleRow?.evidence_count ?? evidence.length)}</p>
          <p>BankID-signaturer: {num(consoleRow?.bankid_signature_count)}</p>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Bärgningsstatus</h3>
          {job ? (
            <>
              <p>Status: <StatusChip status={String(job.status)} /></p>
              <p>Bärgare: {String(consoleRow?.assigned_tow_company_name ?? "Ej tilldelad")}</p>
              <p>Förare: {String(consoleRow?.assigned_driver_name ?? "Ej tilldelad")}</p>
              <p>Bärgningsbil: {String(consoleRow?.assigned_tow_vehicle_registration ?? "Ej tilldelad")}</p>
              <p>ETA: {eta ? `${formatSeconds(eta.eta_seconds)} (${eta.source})` : "Inte tillgänglig ännu"}</p>
            </>
          ) : (
            <p>Ingen bärgning kopplad till ärendet ännu.</p>
          )}
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Integration och risk</h3>
          <p>Externt skadenummer: {String(consoleRow?.claim_number ?? "Ej skapat")}</p>
          <p>Webhook-fel för tenant: {num(consoleRow?.tenant_failed_webhooks)}</p>
          <p>Nästa steg: {String(consoleRow?.next_action_label ?? "I handläggning")}</p>
        </Card>
      </div>

      <Card style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Handläggning</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <form action={approveClaim}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <Button type="submit">Godkänn för handläggning</Button>
          </form>
          <form action={requestMoreInfo} style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <div>
              <label htmlFor="reason1">Begär komplettering</label>
              <input id="reason1" name="reason" placeholder="Vad saknas?" />
            </div>
            <Button type="submit" variant="secondary">Begär uppgifter</Button>
          </form>
          <form action={rejectClaim} style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant.id} />
            <div>
              <label htmlFor="reason2">Avslagsorsak</label>
              <input id="reason2" name="reason" placeholder="Orsak" />
            </div>
            <Button type="submit" variant="secondary">Avslå</Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
