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

/**
 * Filter the candidate pool by availability, capability and network rules.
 *  - insurance cases: restrict to the insurer's contracted partners, unless the
 *    pool is empty and marketplace fallback is allowed.
 *  - private cases: the broader marketplace network is allowed.
 */
export function filterCandidates(
  candidates: DispatchCandidate[],
  request: DispatchRequest,
): DispatchCandidate[] {
  // Availability: online (default true when unknown), not busy, on/ on-call.
  const available = candidates.filter(
    (c) =>
      (c.isOnline ?? true) &&
      !c.isBusy &&
      (c.dutyStatus === "on_duty" || c.dutyStatus === "on_call"),
  );
  const capable = available.filter((c) => meetsRequirements(c, request.requirements));

  // Coverage gate.
  const inCoverage =
    typeof request.maxDistanceMeters === "number"
      ? capable.filter((c) => c.distanceMeters <= request.maxDistanceMeters!)
      : capable;

  // Hard eligibility gate (agreement set for insurance, marketplace set for
  // direct). A candidate outside this set is never offered the job.
  let eligible = inCoverage;
  if (request.eligibleCompanyIds) {
    const allow = new Set(request.eligibleCompanyIds);
    eligible = inCoverage.filter((c) => allow.has(c.towCompanyId));
  }

  // For insurance cases, optionally prefer the contracted network for ranking,
  // falling back to the broader (already-eligible) pool when allowed.
  if (request.payerType === "insurance_company" && request.preferredCompanyIds?.length) {
    const preferred = eligible.filter((c) =>
      request.preferredCompanyIds!.includes(c.towCompanyId),
    );
    if (preferred.length > 0) return preferred;
    if (request.allowMarketplaceFallback || request.strategy === "fallback_marketplace") {
      return eligible;
    }
    return [];
  }
  return eligible;
}

const COMPARATORS: Record<
  DispatchStrategy,
  (a: DispatchCandidate, b: DispatchCandidate) => number
> = {
  nearest_available: (a, b) => a.distanceMeters - b.distanceMeters,
  eta_first: (a, b) => eta(a) - eta(b),
  sla_first: (a, b) => eta(a) - eta(b),
  cost_first: (a, b) => (a.priceMinor ?? Infinity) - (b.priceMinor ?? Infinity),
  insurance_preferred_network: (a, b) => {
    const pa = a.inPreferredNetwork ? 0 : 1;
    const pb = b.inPreferredNetwork ? 0 : 1;
    return pa - pb || eta(a) - eta(b);
  },
  round_robin: (a, b) => (a.roundRobinKey ?? 0) - (b.roundRobinKey ?? 0),
  fallback_marketplace: (a, b) => eta(a) - eta(b),
  manual_dispatch: () => 0,
};

/**
 * Choose and rank dispatch candidates. For high/urgent priority the fastest
 * eligible operator is preferred regardless of the nominal strategy. Manual
 * dispatch returns no automatic offers (a dispatcher selects).
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
  const max = Math.max(1, request.maxCandidates ?? 5);
  const offers = ranked.slice(0, max).map((c, i) => ({
    driverId: c.driverId,
    towCompanyId: c.towCompanyId,
    rank: i,
  }));

  return {
    offers,
    requiresManualReview: offers.length === 0,
    strategy: effectiveStrategy,
  };
}
