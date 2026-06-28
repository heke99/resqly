import type { RiskFlag, RiskStatus } from "@resqly/types";

export interface RiskSignals {
  bankidVerified: boolean;
  bankidIdentityMismatch?: boolean;
  casesInLast24h?: number;
  gpsAccuracyMeters?: number;
  locationManuallyMovedMeters?: number;
  photoCount?: number;
  photosUploadedLate?: boolean;
  sameDeviceCaseCount?: number;
  failedTripsLast30d?: number;
  totalCostMinor?: number;
}

export interface RiskEvaluation {
  status: RiskStatus;
  flags: RiskFlag[];
  score: number;
}

/**
 * Flag-only risk engine (section 25): it raises flags and a score; it must never
 * auto-reject a customer. The highest action is requiring manual review or
 * blocking until BankID verification.
 */
export function evaluateRisk(signals: RiskSignals): RiskEvaluation {
  const flags: RiskFlag[] = [];
  let score = 0;
  const add = (flag: RiskFlag, weight: number) => {
    flags.push(flag);
    score += weight;
  };

  if (!signals.bankidVerified) add("bankid_missing", 30);
  if (signals.bankidIdentityMismatch) add("bankid_identity_mismatch", 40);
  if ((signals.casesInLast24h ?? 0) >= 3) add("many_cases_short_time", 15);
  if ((signals.gpsAccuracyMeters ?? 0) > 200) add("low_gps_accuracy", 10);
  if ((signals.locationManuallyMovedMeters ?? 0) > 2000) add("location_manually_moved_far", 15);
  if ((signals.photoCount ?? 0) === 0) add("missing_photos", 10);
  if (signals.photosUploadedLate) add("photos_uploaded_late", 10);
  if ((signals.sameDeviceCaseCount ?? 0) >= 4) add("same_device_many_cases", 15);
  if ((signals.failedTripsLast30d ?? 0) >= 2) add("repeated_failed_trips", 10);
  if ((signals.totalCostMinor ?? 0) > 2_000_000) add("high_cost", 10);

  score = Math.min(100, score);

  let status: RiskStatus = "low";
  if (signals.bankidIdentityMismatch) status = "blocked_until_verified";
  else if (!signals.bankidVerified) status = "manual_review_required";
  else if (score >= 50) status = "high";
  else if (score >= 25) status = "medium";

  return { status, flags, score };
}
