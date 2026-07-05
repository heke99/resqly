import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../../../_lib";

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

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, tenant_id, status, customer_user_id")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  const inc = incident as { id: string; tenant_id: string; status: string } | null;
  if (!inc) return jsonError(404, "Ärendet hittades inte.");
  if (inc.status === "cancelled") return NextResponse.json({ status: "cancelled" });
  if (!CANCELLABLE_INCIDENT_STATUSES.has(inc.status)) {
    return jsonError(409, "Ärendet kan inte längre avbrytas här. Kontakta supporten så hjälper vi dig.");
  }

  const { data: job } = await db
    .from("tow_jobs" as never)
    .select("id, status, driver_id")
    .eq("incident_id", inc.id)
    .not("status", "in", "(cancelled,failed,closed)" as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const liveJob = job as { id: string; status: string } | null;

  if (liveJob && JOB_LOCKED_STATUSES.has(liveJob.status)) {
    return jsonError(409, "En bärgare är redan på väg. Kontakta supporten för att avbryta.");
  }

  if (liveJob) {
    // Cancel any pending offers so drivers stop seeing the job.
    await db
      .from("tow_job_offers" as never)
      .update({ status: "cancelled" } as never)
      .eq("tow_job_id", liveJob.id)
      .eq("status", "pending");
    await db.from("tow_jobs" as never).update({ status: "cancelled" } as never).eq("id", liveJob.id);
    await db.from("tow_job_status_events" as never).insert({
      tow_job_id: liveJob.id,
      from_status: liveJob.status,
      to_status: "cancelled",
      actor_user_id: user.id,
      reason: `avbruten av kund: ${reason}`,
    } as never);
  }

  await db
    .from("incidents" as never)
    .update({ status: "cancelled" } as never)
    .eq("id", inc.id)
    .eq("customer_user_id", user.id);
  await db.from("incident_status_events" as never).insert({
    incident_id: inc.id,
    from_status: inc.status,
    to_status: "cancelled",
    actor_user_id: user.id,
    reason,
  } as never);
  await db.from("audit_logs" as never).insert({
    tenant_id: inc.tenant_id,
    actor_user_id: user.id,
    action: "status_change",
    entity_type: "incident",
    entity_id: inc.id,
    fields: ["status"],
    metadata: { from: inc.status, to: "cancelled", by: "customer", tow_job_cancelled: liveJob?.id ?? null },
  } as never);

  return NextResponse.json({ status: "cancelled", tow_job_cancelled: Boolean(liveJob) });
}
