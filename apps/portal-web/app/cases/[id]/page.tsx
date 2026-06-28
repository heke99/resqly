import { Badge, Button, Card, EmptyState, PageHeader } from "@resqly/web-kit";
import { getActiveTenant } from "../../lib/tenant";
import {
  getBankidStatus,
  getIncident,
  getIncidentEvidence,
  getIncidentTowJob,
  getLatestEta,
} from "../../lib/data";
import { approveClaim, rejectClaim, requestMoreInfo } from "../../lib/actions";

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

  if (!incident) {
    return (
      <div>
        <PageHeader title="Case" />
        <EmptyState title="Case not found" hint="It may belong to another tenant." />
      </div>
    );
  }

  const bankid = await getBankidStatus(tenant!.id, id);
  const evidence = await getIncidentEvidence(tenant!.id, id);
  const job = await getIncidentTowJob(tenant!.id, id);
  const eta = job ? await getLatestEta(tenant!.id, String(job.id)) : null;

  return (
    <div>
      <PageHeader
        title={String(incident.case_number ?? id)}
        subtitle={`${incident.type} • ${incident.status}`}
        actions={<Badge>{bankid.verified ? "BankID verified" : "BankID pending"}</Badge>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>
        <Card>
          <h3 style={{ marginTop: 0 }}>Case details</h3>
          <p>Type: {String(incident.type)}</p>
          <p>Problem: {String(incident.problem_type ?? incident.damage_type ?? "-")}</p>
          <p>Drivable: {incident.is_drivable ? "Yes" : "No"}</p>
          <p>Description: {String(incident.description ?? "-")}</p>
          <p>Photos/documents: {evidence.length}</p>
        </Card>

        <Card>
          <h3 style={{ marginTop: 0 }}>Towing status & ETA</h3>
          {job ? (
            <>
              <p>Tow status: {String(job.status)}</p>
              <p>
                ETA:{" "}
                {eta ? `${Math.round(Number(eta.eta_seconds) / 60)} min (${eta.source})` : "Not yet available"}
              </p>
            </>
          ) : (
            <p>No tow job for this case.</p>
          )}
        </Card>
      </div>

      <Card style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>Claims handling</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
          <form action={approveClaim}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant!.id} />
            <Button type="submit">Approve</Button>
          </form>
          <form action={requestMoreInfo} style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant!.id} />
            <div>
              <label htmlFor="reason1">Request more info</label>
              <input id="reason1" name="reason" placeholder="What is needed" />
            </div>
            <Button type="submit" variant="secondary">
              Request info
            </Button>
          </form>
          <form action={rejectClaim} style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <input type="hidden" name="incident_id" value={id} />
            <input type="hidden" name="tenant_id" value={tenant!.id} />
            <div>
              <label htmlFor="reason2">Reject reason</label>
              <input id="reason2" name="reason" placeholder="Reason" />
            </div>
            <Button type="submit" variant="secondary">
              Reject
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
