import {
  addEvidenceInputSchema,
  bankidSignInputSchema,
  createIncidentInputSchema,
  requestTowInputSchema,
} from "@resqly/types";
import { AppError, notFound } from "@resqly/utils";
import { buildIncidentRow, determineRequiresBankid } from "@resqly/insurance";
import { getBankidProvider, buildSignatureRecord } from "@resqly/bankid";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import { runDispatchForJob } from "./dispatch";

export async function createIncident(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = createIncidentInputSchema.parse(body);
  const settings = await ctx.repo.getTenantSettings(ctx.tenantId);
  const requiresBankid = determineRequiresBankid(input.type, {
    bankidRequiredForClaims: settings.bankid_required_for_claims,
    bankidRequiredForTow: settings.bankid_required_for_tow,
  });
  const caseNumber = await ctx.repo.allocateCaseNumber(ctx.tenantId, "default");

  const row = buildIncidentRow({
    tenantId: ctx.tenantId,
    // The API acts on behalf of the partner, but customer_user_id must be explicit.
    // Never default to tenant_id because that creates invalid/cross-domain data.
    customerUserId: input.customer_user_id,
    input,
    vehicleId: input.vehicle_id ?? null,
    insuranceCompanyId: input.insurance_company_id ?? null,
    requiresBankid,
    caseNumber,
  });
  const incident = await ctx.repo.createIncident(row);

  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "create",
    entity_type: "incident",
    entity_id: incident.id,
    fields: ["type", "case_number"],
  });

  return {
    status: 201,
    body: {
      incident_id: incident.id,
      case_number: caseNumber,
      status: incident.status,
      requires_bankid: requiresBankid,
    },
  };
}

export async function getIncident(ctx: ApiContext, id: string): Promise<RouteResult> {
  const incident = await ctx.repo.getIncident(ctx.tenantId, id);
  if (!incident) throw notFound("Incident not found");
  return { status: 200, body: incident };
}

export async function addEvidence(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = addEvidenceInputSchema.parse(body);
  const incident = await ctx.repo.getIncident(ctx.tenantId, id);
  if (!incident) throw notFound("Incident not found");
  const evidence = await ctx.repo.addEvidence({
    incident_id: id,
    storage_path: input.storage_path,
    content_type: input.content_type,
  });
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "update",
    entity_type: "incident_evidence",
    entity_id: evidence.id,
    fields: ["storage_path"],
  });
  return { status: 201, body: { evidence_id: evidence.id } };
}

export async function signIncident(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = bankidSignInputSchema.parse(body);
  const incident = await ctx.repo.getIncident(ctx.tenantId, id);
  if (!incident) throw notFound("Incident not found");

  const provider = getBankidProvider(ctx.config.bankid);
  const { orderRef } = await provider.start({
    purpose: input.purpose,
    personalNumber: input.personal_number,
    endUserIp: ctx.ip ?? undefined,
  });

  // Poll the simulated provider to completion (bounded).
  let result = await provider.collect(orderRef);
  for (let i = 0; i < 5 && result.status !== "complete" && result.status !== "failed"; i++) {
    result = await provider.collect(orderRef);
  }
  if (result.status !== "complete" || !result.completionData) {
    throw new AppError("dependency_unavailable", "BankID signing did not complete");
  }

  const signature = buildSignatureRecord({
    tenantId: ctx.tenantId,
    userId: incident.customer_user_id,
    incidentId: incident.id,
    orderRef,
    environment: provider.environment,
    pepper: ctx.config.encryptionKey,
    signedPayload: { case_number: incident.case_number, purpose: input.purpose },
    completion: result.completionData,
    ip: ctx.ip,
  });
  const saved = await ctx.repo.recordBankidSignature(signature);
  await ctx.repo.setIncidentBankidVerified(incident.id);
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "sign",
    entity_type: "bankid_signature",
    entity_id: saved.id,
    fields: ["order_ref", "signed_payload_hash"],
  });

  return { status: 200, body: { status: "complete", order_ref: orderRef, bankid_verified: true } };
}

export async function requestTow(ctx: ApiContext, id: string, body: unknown): Promise<RouteResult> {
  const input = requestTowInputSchema.parse(body);
  const incident = await ctx.repo.getIncident(ctx.tenantId, id);
  if (!incident) throw notFound("Incident not found");

  if (incident.requires_bankid && !incident.bankid_verified) {
    throw new AppError("conflict", "BankID verification is required before requesting a tow");
  }

  const job = await ctx.repo.createTowJob({
    tenant_id: ctx.tenantId,
    incident_id: incident.id,
    status: "created",
    payer_type: input.payer_type,
    priority: input.priority,
  });

  const outcome = await runDispatchForJob(ctx, {
    job,
    pickup: input.pickup,
    payerType: input.payer_type,
    priority: input.priority,
    strategy: input.dispatch_strategy,
    problemType: incident.problem_type,
  });

  return {
    status: 201,
    body: {
      tow_job_id: job.id,
      status: outcome.status,
      offered_drivers: outcome.offeredDrivers,
      requires_manual_review: outcome.requiresManualReview,
      strategy: outcome.strategy,
    },
  };
}
