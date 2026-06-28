import type { DispatchStrategy, DutyStatus, TowVehicleType } from "@resqly/types";

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
  etaSeconds?: number;
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
