import type { TowJobCompleteInput } from "@roadside/types";

export interface CompletionReportRow {
  tenant_id: string;
  tow_job_id: string;
  driver_id: string;
  work_performed: string;
  vehicle_picked_up: boolean;
  destination: string | null;
  waiting_minutes: number;
  failed_trip: boolean;
  customer_signed: boolean;
  observed_damages: string | null;
  comments: string | null;
  extra_cost_minor: number | null;
}

export function buildCompletionReport(params: {
  tenantId: string;
  towJobId: string;
  driverId: string;
  input: TowJobCompleteInput;
  extraCostMinor?: number | null;
}): CompletionReportRow {
  const { input } = params;
  return {
    tenant_id: params.tenantId,
    tow_job_id: params.towJobId,
    driver_id: params.driverId,
    work_performed: input.work_performed,
    vehicle_picked_up: input.vehicle_picked_up,
    destination: input.destination ?? null,
    waiting_minutes: input.waiting_minutes,
    failed_trip: input.failed_trip,
    customer_signed: input.customer_signed,
    observed_damages: input.observed_damages ?? null,
    comments: input.comments ?? null,
    extra_cost_minor: params.extraCostMinor ?? null,
  };
}
