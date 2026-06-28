import { shouldRefreshEta } from "@roadside/maps";
import type { TowJobStatus } from "@roadside/types";

export interface ActiveJob {
  towJobId: string;
  status: TowJobStatus;
  lastEtaAt: number | null;
  slaAtRisk?: boolean;
}

const TRACKED_STATUSES: TowJobStatus[] = [
  "accepted",
  "driver_en_route",
  "driver_arrived",
  "vehicle_loaded",
  "transporting",
];

/** Select the jobs whose ETA should be refreshed now (cost-controlled). */
export function jobsNeedingEtaRefresh(
  jobs: ActiveJob[],
  now: number,
  minIntervalSeconds: number,
): string[] {
  return jobs
    .filter((j) => TRACKED_STATUSES.includes(j.status))
    .filter((j) =>
      shouldRefreshEta({
        lastUpdatedAt: j.lastEtaAt ?? 0,
        now,
        minIntervalSeconds,
        statusChanged: j.lastEtaAt === null,
        slaAtRisk: j.slaAtRisk,
      }),
    )
    .map((j) => j.towJobId);
}
