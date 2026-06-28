import type { CreateIncidentInput, IncidentType } from "@roadside/types";

export interface BankidRequirementSettings {
  bankidRequiredForClaims: boolean;
  bankidRequiredForTow: boolean;
}

/** Whether a given incident type requires BankID per the tenant's settings. */
export function determineRequiresBankid(
  type: IncidentType,
  settings: BankidRequirementSettings,
): boolean {
  if (type === "damage_claim") return settings.bankidRequiredForClaims;
  // towing + roadside assistance follow the tow setting
  return settings.bankidRequiredForTow;
}

export interface BuildIncidentRowInput {
  tenantId: string;
  customerUserId: string;
  input: CreateIncidentInput;
  vehicleId?: string | null;
  insuranceCompanyId?: string | null;
  requiresBankid: boolean;
  caseNumber?: string | null;
}

export type IncidentRow = {
  tenant_id: string;
  customer_user_id: string;
  vehicle_id: string | null;
  insurance_company_id: string | null;
  type: IncidentType;
  status: "draft" | "awaiting_bankid";
  damage_type: string | null;
  problem_type: string | null;
  description: string | null;
  is_drivable: boolean | null;
  needs_tow: boolean | null;
  occurred_at: string | null;
  requires_bankid: boolean;
  bankid_verified: boolean;
  case_number: string | null;
}

/** Build the incident row. New incidents start as draft or awaiting_bankid. */
export function buildIncidentRow(params: BuildIncidentRowInput): IncidentRow {
  return {
    tenant_id: params.tenantId,
    customer_user_id: params.customerUserId,
    vehicle_id: params.vehicleId ?? null,
    insurance_company_id: params.insuranceCompanyId ?? null,
    type: params.input.type,
    status: params.requiresBankid ? "awaiting_bankid" : "draft",
    damage_type: params.input.damage_type ?? null,
    problem_type: params.input.problem_type ?? null,
    description: params.input.description ?? null,
    is_drivable: params.input.is_drivable ?? null,
    needs_tow: params.input.needs_tow ?? null,
    occurred_at: params.input.occurred_at ?? null,
    requires_bankid: params.requiresBankid,
    bankid_verified: false,
    case_number: params.caseNumber ?? null,
  };
}
