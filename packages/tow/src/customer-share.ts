import type { Coordinate, TowJobStatus } from "@resqly/types";
import { AppError } from "@resqly/utils";

/**
 * The EXACT allow-list of customer fields a driver may receive (section 14).
 * Personal identity number, BankID details, insurance history, fraud score and
 * internal notes are deliberately absent and must never be added here.
 */
export const SHAREABLE_CUSTOMER_FIELDS = [
  "customer_name",
  "customer_phone",
  "customer_email",
  "registration_number",
  "problem_summary",
  "pickup_location",
  "pickup_address",
  "destination_address",
  "customer_notes",
] as const;

export type ShareableField = (typeof SHAREABLE_CUSTOMER_FIELDS)[number];

/** Customer data may only be shared once a driver has accepted/been assigned. */
export const SHARE_ALLOWED_STATUSES: TowJobStatus[] = [
  "accepted",
  "driver_en_route",
  "driver_arrived",
  "vehicle_loaded",
  "transporting",
  "delivered",
  "completed",
];

export function canShareCustomerData(status: TowJobStatus): boolean {
  return SHARE_ALLOWED_STATUSES.includes(status);
}

export interface CustomerShareInput {
  tenantId: string;
  towJobId: string;
  driverId: string;
  jobStatus: TowJobStatus;
  customer: { name: string; phone: string; email?: string | null };
  registrationNumber: string;
  problemSummary: string;
  pickup: Coordinate;
  pickupAddress?: string | null;
  destinationAddress?: string | null;
  customerNotes?: string | null;
  reason?: string;
}

export type CustomerShareRow = {
  tenant_id: string;
  tow_job_id: string;
  driver_id: string;
  shared_fields: string[];
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  registration_number: string;
  problem_summary: string;
  pickup_lat: number;
  pickup_lng: number;
  pickup_address: string | null;
  destination_address: string | null;
  customer_notes: string | null;
  reason: string;
}

/**
 * Build the customer-share row, enforcing that sharing only happens after the
 * job is accepted/assigned. Throws a 403 otherwise — this is the server-side
 * guarantee behind the "no data before accept" rule.
 */
export function buildCustomerShare(input: CustomerShareInput): CustomerShareRow {
  if (!canShareCustomerData(input.jobStatus)) {
    throw new AppError(
      "forbidden",
      `Customer data cannot be shared while job is "${input.jobStatus}". ` +
        `Sharing is only permitted after a driver accepts/is assigned.`,
    );
  }
  return {
    tenant_id: input.tenantId,
    tow_job_id: input.towJobId,
    driver_id: input.driverId,
    shared_fields: [...SHAREABLE_CUSTOMER_FIELDS],
    customer_name: input.customer.name,
    customer_phone: input.customer.phone,
    customer_email: input.customer.email ?? null,
    registration_number: input.registrationNumber,
    problem_summary: input.problemSummary,
    pickup_lat: input.pickup.lat,
    pickup_lng: input.pickup.lng,
    pickup_address: input.pickupAddress ?? null,
    destination_address: input.destinationAddress ?? null,
    customer_notes: input.customerNotes ?? null,
    reason: input.reason ?? "driver accepted/assigned to job",
  };
}
