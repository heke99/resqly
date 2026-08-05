import { Card, DataTable, EmptyState, PageHeader, StatusChip, type Column } from "@resqly/web-kit";
import { incidentStatusLabel, towStatusLabel } from "@resqly/ui";
import { getAdminCase } from "../../lib/data";
import { adminCancelCase, adminCompleteJob, adminRedispatchJob } from "../../lib/actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function formatTime(value: unknown): string {
  const s = String(value ?? "");
  return s ? s.slice(0, 16).replace("T", " ") : "—";
}

const CONSENT_LABELS: Record<string, string> = {
  vehicle_insurance_link: "Koppling fordon–försäkringsbolag",
  claim_submission: "Inskickat skadeärende",
  share_with_insurer: "Delning med försäkringsbolag",
  share_with_tow_partner: "Delning med bärgare",
};

export default async function AdminCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getAdminCase(id);
  if (!detail) {
    return (
      <div>
        <PageHeader title="Ärende" />
        <EmptyState title="Ärendet hittades inte" />
      </div>
    );
  }
  const { incident, tenantName, locations, evidenceCount, consents, jobs, offers, timeline, manualReviews } = detail;
  const dispatchJob = jobs.find(
    (j) => !j.driver_id && ["created", "matching", "offered", "failed", "manual_review"].includes(String(j.status)),
  );
  const reviewJob = jobs.find((j) => ["created", "matching", "offered", "failed", "manual_review"].includes(String(j.status)));
  const caseCancellable = [
    "draft", "awaiting_bankid", "bankid_verified", "signed", "submitted",
    "received", "more_info_required", "in_progress",
  ].includes(String(incident.status));
  const hasCaseActions = Boolean(dispatchJob || reviewJob || caseCancellable);

  const offerColumns: Column<Row>[] = [
    { key: "driver", header: "Förare", render: (r) => String(r.driver_id ?? "—").slice(0, 8) },
    { key: "status", header: "Status", render: (r) => <StatusChip status={String(r.status ?? "")} /> },
    { key: "rank", header: "Turordning", render: (r) => String(r.rank ?? 0) },
    { key: "push", header: "Notis", render: (r) => `${String(r.push_status ?? "—")}${r.push_error ? ` (${String(r.push_error)})` : ""}` },
    { key: "expires", header: "Gäller till", render: (r) => formatTime(r.expires_at) },
  ];

  const timelineColumns: Column<Row>[] = [
    { key: "at", header: "Tid", render: (r) => formatTime(r.at) },
    {
      key: "event",
      header: "Händelse",
      render: (r) =>
        r.kind === "tow" ? `Bärgning: ${towStatusLabel(String(r.to_status) as never)}` : `Ärende: ${incidentStatusLabel(String(r.to_status))}`,
    },
    { key: "reason", header: "Anteckning", render: (r) => String(r.reason ?? "—") },
  ];

  return (
    <div>
      <PageHeader
        title={`Ärende ${String(incident.case_number ?? String(incident.id).slice(0, 8).toUpperCase())}`}
        subtitle={`${tenantName ?? "Okänd organisation"} • ${incidentStatusLabel(String(incident.status))}`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Ärendet</h3>
          <p style={{ margin: "4px 0" }}>Typ: {incident.type === "damage_claim" ? "Skadeärende" : "Bärgning/assistans"}</p>
          <p style={{ margin: "4px 0" }}>Status: <StatusChip status={incidentStatusLabel(String(incident.status))} /></p>
          <p style={{ margin: "4px 0" }}>BankID: {incident.requires_bankid ? (incident.bankid_verified ? "Verifierad" : "Krävs — ej verifierad") : "Krävs ej"}</p>
          <p style={{ margin: "4px 0" }}>Bilder/dokument: {evidenceCount}</p>
          <p style={{ margin: "4px 0" }}>Skapat: {formatTime(incident.created_at)}</p>
          {locations.map((loc, i) => (
            <p key={i} style={{ margin: "4px 0" }}>
              {loc.kind === "destination" ? "Destination" : "Upphämtning"}:{" "}
              {String(loc.address ?? (loc.lat != null && loc.lng != null ? `${Number(loc.lat).toFixed(4)}, ${Number(loc.lng).toFixed(4)}` : "—"))}
            </p>
          ))}
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Samtycken</h3>
          {consents.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Inga registrerade samtycken.</p>
          ) : (
            consents.map((c, i) => (
              <p key={i} style={{ margin: "4px 0" }}>
                {CONSENT_LABELS[String(c.consent_kind)] ?? String(c.consent_kind)} — {formatTime(c.accepted_at)}
              </p>
            ))
          )}
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Bärgningsuppdrag</h3>
          {jobs.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Ingen bärgning begärd.</p>
          ) : (
            jobs.map((j) => (
              <div key={String(j.id)} style={{ marginBottom: 10 }}>
                <p style={{ margin: "4px 0" }}>
                  {String(j.id).slice(0, 8).toUpperCase()} — <StatusChip status={towStatusLabel(String(j.status) as never)} />
                </p>
                <p style={{ margin: "4px 0", opacity: 0.7 }}>
                  {j.payer_type === "customer_private" ? "Privat" : "Försäkring"} • Förare: {j.driver_id ? String(j.driver_id).slice(0, 8) : "Ej tilldelad"}
                </p>
              </div>
            ))
          )}
          {manualReviews.length > 0 ? (
            <p style={{ margin: "4px 0", color: "#B45309" }}>
              Manuell hjälp: {String(manualReviews[0]!.reason ?? "")} ({String(manualReviews[0]!.status ?? "open")})
            </p>
          ) : null}
        </Card>

        {hasCaseActions ? (
          <Card>
            <h3 style={{ marginTop: 0 }}>Åtgärder (loggas alltid)</h3>
            {dispatchJob ? (
              <form action={adminRedispatchJob} style={{ marginBottom: 14 }}>
                <input type="hidden" name="tow_job_id" value={String(dispatchJob.id)} />
                <button type="submit">Skicka ut uppdraget igen</button>
                <p style={{ opacity: 0.65, fontSize: 13, margin: "4px 0 0" }}>
                  Avbryter väntande erbjudanden och matchar behöriga bärgare på nytt.
                </p>
              </form>
            ) : null}
            {reviewJob ? (
              <form action={adminCompleteJob} style={{ marginBottom: 14 }}>
                <input type="hidden" name="tow_job_id" value={String(reviewJob.id)} />
                <label htmlFor="complete-reason" style={{ display: "block", fontSize: 13 }}>Anledning till manuell kontroll</label>
                <input id="complete-reason" name="reason" required placeholder="T.ex. status behöver verifieras med förare och kund" style={{ width: "100%" }} />
                <button type="submit" style={{ marginTop: 6 }}>Skicka till manuell kontroll</button>
              </form>
            ) : null}
            {caseCancellable ? (
              <form action={adminCancelCase}>
                <input type="hidden" name="incident_id" value={String(incident.id)} />
                <label htmlFor="cancel-reason" style={{ display: "block", fontSize: 13 }}>Anledning till avbrytande</label>
                <input id="cancel-reason" name="reason" required placeholder="T.ex. kunden återkallade begäran" style={{ width: "100%" }} />
                <button type="submit" style={{ marginTop: 6 }}>Avbryt ärendet</button>
              </form>
            ) : null}
          </Card>
        ) : null}
      </div>

      <h3 style={{ marginTop: 24 }}>Erbjudanden</h3>
      <DataTable columns={offerColumns} rows={offers} empty="Inga erbjudanden har skickats." />

      <h3 style={{ marginTop: 24 }}>Tidslinje</h3>
      <DataTable columns={timelineColumns} rows={timeline as unknown as Row[]} empty="Inga händelser ännu." />
    </div>
  );
}
