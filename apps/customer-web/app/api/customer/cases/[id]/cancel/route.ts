import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../../../_lib";
import { sendCustomerEmail } from "../../../_email";

/** Incident statuses a customer may cancel from without support involvement. */
const CANCELLABLE_INCIDENT_STATUSES = new Set([
  "draft",
  "awaiting_bankid",
  "bankid_verified",
  "signed",
  "submitted",
  "received",
  "more_info_required",
]);

/** Once a driver is en route or later, cancellation goes through support. */
const JOB_LOCKED_STATUSES = new Set([
  "driver_en_route",
  "driver_arrived",
  "vehicle_loaded",
  "transporting",
  "delivered",
  "completed",
  "invoiced",
  "closed",
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 300) : null;
  if (!reason) return jsonError(400, "Ange varför du vill avbryta ärendet.");

  const { data: incident, error: incidentError } = await db
    .from("incidents" as never)
    .select("id, tenant_id, status, customer_user_id")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  if (incidentError) return jsonError(503, "Ärendet kunde inte hämtas just nu. Försök igen.");
  const inc = incident as { id: string; tenant_id: string; status: string } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");
  if (inc.status === "cancelled") return NextResponse.json({ status: "cancelled" });
  if (!CANCELLABLE_INCIDENT_STATUSES.has(inc.status)) {
    return jsonError(409, "Ärendet kan inte längre avbrytas här. Kontakta supporten så hjälper vi dig.");
  }

  const { data: job, error: jobError } = await db
    .from("tow_jobs" as never)
    .select("id, status, driver_id")
    .eq("incident_id", inc.id)
    .not("status", "in", "(cancelled,failed,closed)" as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jobError) return jsonError(503, "Bärgningsstatus kunde inte hämtas just nu. Försök igen.");
  const liveJob = job as { id: string; status: string } | null;

  if (liveJob && JOB_LOCKED_STATUSES.has(liveJob.status)) {
    return jsonError(409, "En bärgare är redan på väg. Kontakta supporten för att avbryta.");
  }

  const { data: cancelResult, error: cancelError } = await db.rpc(
    "cancel_incident_workflow" as never,
    {
      p_incident: inc.id,
      p_actor_user: user.id,
      p_reason: reason,
      p_customer_only: true,
    } as never,
  );
  if (cancelError) return jsonError(503, "Ärendet kunde inte avbrytas just nu. Försök igen.");
  const result = (cancelResult ?? {}) as {
    error?: string;
    status?: string;
    tow_job_cancelled?: boolean;
  };
  if (result.error === "tow_job_locked" || result.error === "incident_locked") {
    return jsonError(409, "Ärendet kan inte längre avbrytas här. Kontakta supporten så hjälper vi dig.");
  }
  if (result.error === "not_found" || result.error === "forbidden") {
    return jsonError(404, "Ärendet hittades inte.");
  }
  if (result.error) return jsonError(409, "Ärendet kunde inte avbrytas.");

  await sendCustomerEmail(db, {
    tenantId: inc.tenant_id,
    to: user.email,
    subject: "Ditt ärende är avbrutet",
    html: `<p>Ditt ärende är avbrutet enligt din begäran.</p><p>Behöver du hjälp igen är det bara att skapa ett nytt ärende.</p>`,
    incidentId: inc.id,
    dedupeKey: `email:case_cancelled:${inc.id}`,
  });

  return NextResponse.json({ status: "cancelled", tow_job_cancelled: result.tow_job_cancelled === true });
}
