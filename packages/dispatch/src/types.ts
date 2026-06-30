import type { Coordinate, DispatchStrategy, DutyStatus, TowVehicleType } from "@resqly/types";

export interface CandidateCapabilities {
  canHandleEv?: boolean;
  hasFlatbed?: boolean;
  hasWheelLift?: boolean;
  canTowHeavy?: boolean;
  canTowMotorcycle?: boolean;
}

export interface DispatchCandidate {
  driverId: string;
  towCompanyId: string;
  dutyStatus: DutyStatus;
  distanceMeters: number;
  /** Last known driver location used only for server-side ETA enrichment. */
  location?: Coordinate;
  etaSeconds?: number;
  etaSource?: "google_matrix" | "google_routes" | "haversine_fallback" | "last_known";
  etaDegraded?: boolean;
  vehicleType?: TowVehicleType;
  capabilities?: CandidateCapabilities;
  rating?: number;
  acceptRate?: number;
  priceMinor?: number;
  /** Whether this company is in the insurer's contracted network. */
  inPreferredNetwork?: boolean;
  /** For round-robin: lower means "longer since last dispatched". */
  roundRobinKey?: number;
  isBusy?: boolean;
  /** Whether the driver is currently online. Defaults to online when omitted. */
  isOnline?: boolean;
}

export interface DispatchRequirements {
  needsEv?: boolean;
  needsFlatbed?: boolean;
  needsHeavy?: boolean;
  needsMotorcycle?: boolean;
}

export interface DispatchRequest {
  strategy: DispatchStrategy;
  payerType: "insurance_company" | "customer_private";
  priority: "normal" | "high" | "urgent";
  requirements?: DispatchRequirements;
  /** Insurer's contracted tow companies (used for insurance cases). */
  preferredCompanyIds?: string[];
  /**
   * Hard eligibility gate. When provided, only candidates whose tow company is
   * in this set are ever considered. For insurance cases this is the set of
   * companies with an active agreement; for direct/private cases it is the set
   * of marketplace-enabled companies. A candidate outside this set is NEVER
   * offered the job, regardless of distance or ranking.
   */
  eligibleCompanyIds?: string[];
  /** Coverage gate: candidates farther than this are excluded. */
  maxDistanceMeters?: number;
  allowMarketplaceFallback?: boolean;
  maxCandidates?: number;
}

export interface DispatchOffer {
  driverId: string;
  towCompanyId: string;
  rank: number;
}

export interface DispatchResult {
  offers: DispatchOffer[];
  /** True when no eligible candidate was found -> escalate to manual_review. */
  requiresManualReview: boolean;
  strategy: DispatchStrategy;
}
