import type { IncidentStatus } from "@resqly/types";
import { TransitionGuard } from "@resqly/utils";

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  draft: ["awaiting_bankid", "submitted", "cancelled"],
  awaiting_bankid: ["bankid_verified", "cancelled", "rejected"],
  bankid_verified: ["signed", "submitted", "cancelled"],
  signed: ["submitted", "cancelled"],
  submitted: ["received", "more_info_required", "in_progress", "rejected", "cancelled"],
  received: ["more_info_required", "in_progress", "rejected", "closed"],
  more_info_required: ["submitted", "received", "in_progress", "cancelled"],
  in_progress: ["completed", "more_info_required", "cancelled"],
  completed: ["closed"],
  closed: [],
  cancelled: [],
  rejected: [],
};

export const incidentStatusGuard = new TransitionGuard<IncidentStatus>(INCIDENT_TRANSITIONS);

export type IncidentStatusEventRow = {
  incident_id: string;
  from_status: IncidentStatus | null;
  to_status: IncidentStatus;
  actor_user_id: string | null;
  reason: string | null;
}

/** Validate a transition and produce the status-event row to persist. */
export function transitionIncident(params: {
  incidentId: string;
  from: IncidentStatus;
  to: IncidentStatus;
  actorUserId?: string | null;
  reason?: string | null;
}): IncidentStatusEventRow {
  incidentStatusGuard.assertTransition(params.from, params.to);
  return {
    incident_id: params.incidentId,
    from_status: params.from,
    to_status: params.to,
    actor_user_id: params.actorUserId ?? null,
    reason: params.reason ?? null,
  };
}
