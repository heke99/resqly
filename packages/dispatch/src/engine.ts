import type { DispatchStrategy } from "@resqly/types";
import type {
  DispatchCandidate,
  DispatchRequest,
  DispatchRequirements,
  DispatchResult,
} from "./types";

function meetsRequirements(c: DispatchCandidate, req?: DispatchRequirements): boolean {
  if (!req) return true;
  const caps = c.capabilities ?? {};
  if (req.needsEv && !caps.canHandleEv) return false;
  if (req.needsFlatbed && !caps.hasFlatbed) return false;
  if (req.needsHeavy && !caps.canTowHeavy) return false;
  if (req.needsMotorcycle && !caps.canTowMotorcycle) return false;
  return true;
}

const eta = (c: DispatchCandidate) => c.etaSeconds ?? c.distanceMeters; // fallback to distance
const agreementPriority = (c: DispatchCandidate) => c.agreementPriority ?? Number.MAX_SAFE_INTEGER;

/**
 * Filter the candidate pool by availability, capability and network rules.
 *
 * Insurance cases are contract-only: every offered candidate must be tied to an
 * active insurer agreement. There is deliberately no open-marketplace fallback
 * for insurer-funded jobs unless the caller passes an explicit eligible set
 * produced from active insurer agreements.
 *
 * Direct/private cases are free-marketplace jobs: only marketplace-enabled tow
 * companies are eligible and they are ranked from nearest/fastest outward.
 */
export function filterCandidates(
  candidates: DispatchCandidate[],
  request: DispatchRequest,
): DispatchCandidate[] {
  const available = candidates.filter(
    (c) =>
      (c.isOnline ?? true) &&
      !c.isBusy &&
      (c.dutyStatus === "on_duty" || c.dutyStatus === "on_call"),
  );
  const capable = available.filter((c) => meetsRequirements(c, request.requirements));

  const inCoverage =
    typeof request.maxDistanceMeters === "number"
      ? capable.filter((c) => c.distanceMeters <= request.maxDistanceMeters!)
      : capable;

  let eligible = inCoverage;
  if (request.eligibleCompanyIds) {
    const allow = new Set(request.eligibleCompanyIds);
    eligible = eligible.filter((c) => allow.has(c.towCompanyId));
  }

  if (request.payerType === "insurance_company") {
    // Insurance jobs are contract-only. A preferred flag is not enough by
    // itself; the candidate must come from an active agreement set.
    eligible = eligible.filter(
      (c) => Boolean(c.insuranceAgreementId) || Boolean(request.eligibleCompanyIds?.includes(c.towCompanyId)),
    );

    return eligible;
  }

  // Direct/private: open marketplace only. The allow-list is an additional
  // hard gate; it does not turn a closed company into a marketplace company.
  return eligible.filter(
    (c) => c.marketplaceEnabled === true && (!request.eligibleCompanyIds || request.eligibleCompanyIds.includes(c.towCompanyId)),
  );
}

const COMPARATORS: Record<
  DispatchStrategy,
  (a: DispatchCandidate, b: DispatchCandidate) => number
> = {
  nearest_available: (a, b) => a.distanceMeters - b.distanceMeters,
  eta_first: (a, b) => eta(a) - eta(b),
  sla_first: (a, b) => agreementPriority(a) - agreementPriority(b) || eta(a) - eta(b),
  cost_first: (a, b) => (a.priceMinor ?? Infinity) - (b.priceMinor ?? Infinity) || eta(a) - eta(b),
  insurance_preferred_network: (a, b) => {
    const pa = a.inPreferredNetwork ? 0 : 1;
    const pb = b.inPreferredNetwork ? 0 : 1;
    return pa - pb || agreementPriority(a) - agreementPriority(b) || eta(a) - eta(b);
  },
  round_robin: (a, b) => (a.roundRobinKey ?? 0) - (b.roundRobinKey ?? 0) || eta(a) - eta(b),
  fallback_marketplace: (a, b) => eta(a) - eta(b),
  manual_dispatch: () => 0,
};

/**
 * Choose and rank dispatch candidates.
 *
 * Insurance-funded jobs broadcast to all eligible contracted/approved tow
 * vehicles in range by default, so every authorised truck gets a push and the
 * first race-safe accept wins. Direct/private jobs are ranked nearest/fastest
 * outward and can be capped by maxCandidates.
 */
export function selectDispatch(
  candidates: DispatchCandidate[],
  request: DispatchRequest,
): DispatchResult {
  const eligible = filterCandidates(candidates, request);

  if (request.strategy === "manual_dispatch") {
    return { offers: [], requiresManualReview: eligible.length === 0, strategy: request.strategy };
  }

  const effectiveStrategy: DispatchStrategy =
    request.priority === "urgent" || request.priority === "high"
      ? "eta_first"
      : request.strategy;

  const ranked = [...eligible].sort(COMPARATORS[effectiveStrategy]);
  const shouldBroadcastAll = request.offerAllEligible ?? request.payerType === "insurance_company";
  const max = shouldBroadcastAll ? ranked.length : Math.max(1, request.maxCandidates ?? 5);
  const offers = ranked.slice(0, max).map((c, i) => ({
    driverId: c.driverId,
    towCompanyId: c.towCompanyId,
    towVehicleId: c.towVehicleId ?? null,
    rank: i,
    distanceMeters: c.distanceMeters,
    etaSeconds: c.etaSeconds,
    agreementPriority: c.agreementPriority ?? null,
  }));

  return {
    offers,
    requiresManualReview: offers.length === 0,
    strategy: effectiveStrategy,
  };
}
