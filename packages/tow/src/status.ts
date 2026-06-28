import type { TowJobStatus } from "@roadside/types";
import { TransitionGuard } from "@roadside/utils";

export const TOW_JOB_TRANSITIONS: Record<TowJobStatus, readonly TowJobStatus[]> = {
  draft: ["awaiting_bankid", "created", "cancelled"],
  awaiting_bankid: ["bankid_verified", "cancelled", "failed"],
  bankid_verified: ["signed", "cancelled"],
  signed: ["created", "cancelled"],
  created: ["matching", "cancelled", "manual_review"],
  matching: ["offered", "manual_review", "cancelled", "failed"],
  offered: ["accepted", "matching", "manual_review", "cancelled", "failed"],
  accepted: ["driver_en_route", "cancelled", "failed"],
  driver_en_route: ["driver_arrived", "cancelled", "failed"],
  driver_arrived: ["vehicle_loaded", "failed", "cancelled"],
  vehicle_loaded: ["transporting", "failed"],
  transporting: ["delivered", "failed"],
  delivered: ["completed"],
  completed: ["invoiced"],
  invoiced: ["closed"],
  closed: [],
  cancelled: [],
  failed: ["matching", "manual_review"],
  manual_review: ["matching", "offered", "cancelled"],
};

export const towJobStatusGuard = new TransitionGuard<TowJobStatus>(TOW_JOB_TRANSITIONS);

export type TowJobStatusEventRow = {
  tow_job_id: string;
  from_status: TowJobStatus | null;
  to_status: TowJobStatus;
  actor_user_id: string | null;
  reason: string | null;
}

export function transitionTowJob(params: {
  towJobId: string;
  from: TowJobStatus;
  to: TowJobStatus;
  actorUserId?: string | null;
  reason?: string | null;
}): TowJobStatusEventRow {
  towJobStatusGuard.assertTransition(params.from, params.to);
  return {
    tow_job_id: params.towJobId,
    from_status: params.from,
    to_status: params.to,
    actor_user_id: params.actorUserId ?? null,
    reason: params.reason ?? null,
  };
}
