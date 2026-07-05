import { NextResponse } from "next/server";
import { requireCustomer, jsonError } from "../../../_lib";

export interface TimelineEntry {
  at: string;
  kind: "incident" | "tow";
  to_status: string;
  reason: string | null;
}

/**
 * Merged, customer-safe case timeline: incident status events plus the tow
 * job's status events. Served server-side (ownership-checked) because the
 * tow event table is not directly readable by customers under RLS.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomer(request);
  if (session instanceof NextResponse) return session;
  const { db, user } = session;
  const { id } = await params;

  const { data: incident } = await db
    .from("incidents" as never)
    .select("id, customer_user_id, created_at")
    .eq("id", id)
    .eq("customer_user_id", user.id)
    .maybeSingle();
  if (!incident) return jsonError(404, "Ärendet hittades inte.");

  const { data: incidentEvents } = await db
    .from("incident_status_events" as never)
    .select("created_at, to_status, reason")
    .eq("incident_id", id)
    .order("created_at", { ascending: true })
    .limit(100);

  const { data: jobs } = await db
    .from("tow_jobs" as never)
    .select("id")
    .eq("incident_id", id)
    .order("created_at", { ascending: false })
    .limit(3);
  const jobIds = ((jobs as Array<{ id: string }> | null) ?? []).map((j) => j.id);

  let towEvents: Array<{ created_at: string; to_status: string; reason: string | null }> = [];
  if (jobIds.length > 0) {
    const { data } = await db
      .from("tow_job_status_events" as never)
      .select("created_at, to_status, reason")
      .in("tow_job_id", jobIds)
      .order("created_at", { ascending: true })
      .limit(200);
    towEvents = (data as typeof towEvents | null) ?? [];
  }

  const entries: TimelineEntry[] = [
    ...(((incidentEvents as Array<{ created_at: string; to_status: string; reason: string | null }> | null) ?? []).map(
      (e) => ({ at: e.created_at, kind: "incident" as const, to_status: e.to_status, reason: e.reason ?? null }),
    )),
    ...towEvents.map((e) => ({
      at: e.created_at,
      kind: "tow" as const,
      to_status: e.to_status,
      reason: e.reason ?? null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const { data: locations } = await db
    .from("incident_locations" as never)
    .select("kind, address, lat, lng")
    .eq("incident_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    entries,
    locations: (locations as Array<{ kind: string; address: string | null; lat: number | null; lng: number | null }> | null) ?? [],
  });
}
