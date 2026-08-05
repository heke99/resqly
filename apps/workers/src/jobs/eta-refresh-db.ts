import type { AppSupabaseClient } from "@resqly/database";
import { buildEtaSnapshot, type MapsClient } from "@resqly/maps";
import type { TowJobStatus } from "@resqly/types";
import { jobsNeedingEtaRefresh, type ActiveJob } from "./eta-refresh";

const ACTIVE_STATUSES = ["accepted", "driver_en_route", "driver_arrived", "vehicle_loaded", "transporting"];

/**
 * Periodically refresh ETA snapshots for active jobs so the customer app and
 * portals show a live arrival estimate even when the driver app is quiet.
 * Uses Google Routes when configured and falls back to haversine estimates —
 * a Maps outage degrades ETA quality but never breaks the job flow.
 */
export async function pollEtaRefresh(
  db: AppSupabaseClient,
  maps: MapsClient,
  opts: { now?: number; minIntervalSeconds?: number; limit?: number } = {},
): Promise<void> {
  const now = opts.now ?? Date.now();
  const minInterval = opts.minIntervalSeconds ?? 120;

  const { data: jobRows, error: jobsError } = await db
    .from("tow_jobs" as never)
    .select("id, status, driver_id, incident_id, sla_deadline")
    .in("status", ACTIVE_STATUSES as never)
    .not("driver_id", "is", null)
    .limit(opts.limit ?? 50);
  if (jobsError) throw new Error(`ETA job load failed: ${jobsError.message}`);
  const jobs = ((jobRows as Array<{
    id: string;
    status: TowJobStatus;
    driver_id: string;
    incident_id: string;
    sla_deadline: string | null;
  }> | null) ?? []);
  if (jobs.length === 0) return;

  const active: ActiveJob[] = [];
  const lastEtaByJob = new Map<string, number | null>();
  for (const job of jobs) {
    const { data: eta, error: etaError } = await db
      .from("tow_job_eta_snapshots" as never)
      .select("created_at")
      .eq("tow_job_id", job.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (etaError) throw new Error(`ETA snapshot load failed: ${etaError.message}`);
    const lastEtaAt = eta ? Date.parse((eta as { created_at: string }).created_at) : null;
    lastEtaByJob.set(job.id, lastEtaAt);
    active.push({
      towJobId: job.id,
      status: job.status,
      lastEtaAt,
      slaAtRisk: job.sla_deadline ? Date.parse(job.sla_deadline) - now < 15 * 60_000 : false,
    });
  }

  const due = new Set(jobsNeedingEtaRefresh(active, now, minInterval));
  const failures: string[] = [];
  for (const job of jobs) {
    if (!due.has(job.id)) continue;
    try {
      const { data: driver, error: driverError } = await db
        .from("tow_drivers" as never)
        .select("last_lat, last_lng")
        .eq("id", job.driver_id)
        .maybeSingle();
      if (driverError) throw new Error(`driver load failed: ${driverError.message}`);
      const d = driver as { last_lat: number | null; last_lng: number | null } | null;
      if (!d || d.last_lat == null || d.last_lng == null) continue;

      const { data: loc, error: locationError } = await db
        .from("incident_locations" as never)
        .select("lat, lng")
        .eq("incident_id", job.incident_id)
        .eq("kind", "pickup")
        .maybeSingle();
      if (locationError) throw new Error(`pickup load failed: ${locationError.message}`);
      const pickup = loc as { lat: number; lng: number } | null;
      if (!pickup) continue;

      const eta = await maps.calculateRouteEta(
        { lat: d.last_lat, lng: d.last_lng },
        { lat: pickup.lat, lng: pickup.lng },
      );
      const { error: insertError } = await db.from("tow_job_eta_snapshots" as never).insert(
        buildEtaSnapshot({ towJobId: job.id, driverId: job.driver_id, eta }) as never,
      );
      if (insertError) throw new Error(`ETA snapshot insert failed: ${insertError.message}`);
    } catch (error) {
      // Continue the batch, but report a degraded worker heartbeat so failures are visible.
      failures.push(`${job.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`ETA refresh failed for ${failures.length} job(s): ${failures.join(" | ").slice(0, 3000)}`);
  }
}
