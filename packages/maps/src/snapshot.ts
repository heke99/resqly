import type { EtaResult } from "./client";

export interface EtaSnapshotInput {
  towJobId: string;
  driverId?: string | null;
  eta: EtaResult;
}

/** Build a persistable ETA snapshot row (the caller performs the DB insert). */
export function buildEtaSnapshot(input: EtaSnapshotInput) {
  return {
    tow_job_id: input.towJobId,
    driver_id: input.driverId ?? null,
    eta_seconds: input.eta.etaSeconds,
    distance_meters: input.eta.distanceMeters,
    source: input.eta.source,
    degraded: input.eta.degraded,
  };
}

/** Decide whether ETA should be refreshed (cost control). */
export function shouldRefreshEta(params: {
  lastUpdatedAt: number;
  now: number;
  minIntervalSeconds: number;
  significantLocationChangeMeters?: number;
  statusChanged?: boolean;
  slaAtRisk?: boolean;
}): boolean {
  if (params.statusChanged || params.slaAtRisk) return true;
  if ((params.significantLocationChangeMeters ?? 0) >= 250) return true;
  return params.now - params.lastUpdatedAt >= params.minIntervalSeconds * 1000;
}
