import { z } from "zod";
import {
  addEvidenceInputSchema,
  bankidSignInputSchema,
  createIncidentInputSchema,
  requestTowInputSchema,
} from "@resqly/types";
import { AppError, notFound, sha256Hex } from "@resqly/utils";
import { buildIncidentRow, determineRequiresBankid } from "@resqly/insurance";
import {
  buildSignatureRecord,
  getBankidProvider,
  verifyTicWebhookSignature,
  type BankidCollectResult,
  type BankidStartResult,
} from "@resqly/bankid";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import type { BankidSessionRecord, IncidentRecord } from "../repo/types";
import { runDispatchForJob } from "./dispatch";
import { enqueueWebhookEvent, escapeHtml, sendEmail } from "../services/notifications";

const bankidStartSchema = z.object({
  purpose: z.string().min(1).default("Verifiera bärgningsärende"),
  personal_number: z.string().optional(),
  callback_url: z.string().url().optional(),
});

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
  await enqueueWebhookEvent(ctx, "incident.created", {
    incident_id: incident.id,
    case_number: caseNumber,
    type: incident.type,
    status: incident.status,
    requires_bankid: requiresBankid,
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

export async function startIncidentBankid(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = bankidStartSchema.parse(body ?? {});
  const incident = await ctx.repo.getIncident(ctx.tenantId, id);
  if (!incident) throw notFound("Incident not found");
  const provider = getBankidProvider(ctx.config.bankid);
  const started = await provider.start({
    purpose: input.purpose,
    personalNumber: input.personal_number,
    endUserIp: requiredEndUserIp(ctx),
    userAgent: ctx.headers?.["user-agent"],
    callbackUrl: input.callback_url ?? callbackUrl(ctx),
    webhookUrl: ticWebhookUrl(ctx),
    state: bankidState(ctx.tenantId, incident.id, "auth"),
  });
  await persistBankidSession(ctx, incident, input.purpose, started, "auth");
  await enqueueWebhookEvent(ctx, "incident.bankid_started", {
    incident_id: incident.id,
    case_number: incident.case_number,
    session_id: started.sessionId,
  });
  return { status: 202, body: publicStartBody(started) };
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
  const signedPayload = signedPayloadForIncident(incident, input.purpose);

  // Preserve existing mock/test behaviour: instant complete for local tests.
  if (provider.environment !== "production") {
    const { sessionId, orderRef } = await provider.sign({
      purpose: input.purpose,
      personalNumber: input.personal_number,
      endUserIp: ctx.ip ?? undefined,
      userVisibleData: userVisibleBankidText(incident, input.purpose),
      userNonVisibleData: JSON.stringify(signedPayload),
    });
    let result = await provider.poll(sessionId);
    for (let i = 0; i < 5 && result.status !== "complete" && result.status !== "failed"; i++) {
      result = await provider.poll(sessionId);
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
      signedPayload,
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
    await enqueueWebhookEvent(ctx, "incident.bankid_verified", {
      incident_id: incident.id,
      case_number: incident.case_number,
      order_ref: orderRef,
    });
    return { status: 200, body: { status: "complete", order_ref: orderRef, bankid_verified: true } };
  }

  const started = await provider.sign({
    purpose: input.purpose,
    personalNumber: input.personal_number,
    endUserIp: requiredEndUserIp(ctx),
    userAgent: ctx.headers?.["user-agent"],
    callbackUrl: callbackUrl(ctx),
    webhookUrl: ticWebhookUrl(ctx),
    state: bankidState(ctx.tenantId, incident.id, "sign"),
    userVisibleData: userVisibleBankidText(incident, input.purpose),
    userVisibleDataFormat: "simpleMarkdownV1",
    userNonVisibleData: JSON.stringify(signedPayload),
  });
  await persistBankidSession(ctx, incident, input.purpose, started, "sign", signedPayload);
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    action: "sign",
    entity_type: "bankid_session",
    entity_id: started.sessionId,
    fields: ["tic_session_id", "purpose"],
  });
  await enqueueWebhookEvent(ctx, "incident.bankid_started", {
    incident_id: incident.id,
    case_number: incident.case_number,
    session_id: started.sessionId,
  });

  return { status: 202, body: publicStartBody(started) };
}

export async function pollBankidSession(
  ctx: ApiContext,
  sessionId: string,
): Promise<RouteResult> {
  const session = await ctx.repo.getBankidSessionById(sessionId);
  if (!session || session.tenant_id !== ctx.tenantId) throw notFound("BankID session not found");
  const provider = getBankidProvider(ctx.config.bankid);
  const result = await provider.poll(session.tic_session_id ?? session.order_ref ?? sessionId);
  const handled = await handleBankidResult(ctx, session, result);
  return { status: 200, body: handled };
}

export async function collectBankidSession(
  ctx: ApiContext,
  sessionId: string,
): Promise<RouteResult> {
  const session = await ctx.repo.getBankidSessionById(sessionId);
  if (!session || session.tenant_id !== ctx.tenantId) throw notFound("BankID session not found");
  const provider = getBankidProvider(ctx.config.bankid);
  const result = await provider.collect(session.tic_session_id ?? session.order_ref ?? sessionId);
  const handled = await handleBankidResult(ctx, session, result);
  return { status: 200, body: handled };
}

export async function cancelBankidSession(
  ctx: ApiContext,
  sessionId: string,
): Promise<RouteResult> {
  const session = await ctx.repo.getBankidSessionById(sessionId);
  if (!session || session.tenant_id !== ctx.tenantId) throw notFound("BankID session not found");
  const provider = getBankidProvider(ctx.config.bankid);
  await provider.cancel(session.tic_session_id ?? session.order_ref ?? sessionId);
  await ctx.repo.updateBankidSession(session.id, { status: "cancelled", raw_status: { cancelled_at: new Date().toISOString() } });
  return { status: 200, body: { status: "cancelled" } };
}

export async function ticWebhook(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const secret = ctx.config.bankid.tic?.webhookSecret;
  if (!secret) throw new AppError("dependency_unavailable", "TIC webhook secret is not configured");
  const rawBody = ctx.rawBody ?? JSON.stringify(body ?? {});
  const signature = ctx.headers?.["x-ormeo-signature"];
  if (!verifyTicWebhookSignature(secret, rawBody, signature)) {
    throw new AppError("unauthorized", "Invalid TIC webhook signature");
  }

  const payload = body as { event?: string; data?: { sessionId?: string; status?: string } };
  const event = ctx.headers?.["x-ormeo-event"] ?? payload.event;
  if (event !== "auth.completed" && event !== "sign.completed") {
    return { status: 202, body: { status: "ignored", event } };
  }
  const ticSessionId = payload.data?.sessionId;
  if (!ticSessionId) throw new AppError("bad_request", "Missing TIC sessionId");
  const session = await ctx.repo.getBankidSessionByTicSessionId(ticSessionId);
  if (!session || !session.tenant_id) return { status: 202, body: { status: "unknown_session" } };

  const provider = getBankidProvider(ctx.config.bankid);
  const result = await provider.collect(ticSessionId);
  const effectiveCtx = { ...ctx, tenantId: session.tenant_id };
  const handled = await handleBankidResult(effectiveCtx, session, result, true);
  return { status: 200, body: handled };
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
  await enqueueWebhookEvent(ctx, "tow.requested", {
    incident_id: incident.id,
    case_number: incident.case_number,
    tow_job_id: job.id,
    priority: input.priority,
    payer_type: input.payer_type,
  });

  const outcome = await runDispatchForJob(ctx, {
    job,
    pickup: input.pickup,
    payerType: input.payer_type,
    priority: input.priority,
    strategy: input.dispatch_strategy,
    problemType: incident.problem_type,
  });

  const contact = await ctx.repo.getCustomerContact(incident.id);
  await sendEmail(ctx, {
    to: contact?.email,
    subject: `Bärgningsärende ${incident.case_number ?? job.id} är mottaget`,
    html: `<p>Vi har tagit emot ditt bärgningsärende.</p><p>Status: ${escapeHtml(outcome.status)}</p>`,
    incidentId: incident.id,
    towJobId: job.id,
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

async function persistBankidSession(
  ctx: ApiContext,
  incident: IncidentRecord,
  purpose: string,
  started: BankidStartResult,
  flow: "auth" | "sign",
  signedPayload?: Record<string, unknown>,
): Promise<BankidSessionRecord> {
  return ctx.repo.createBankidSession({
    tenant_id: ctx.tenantId,
    user_id: incident.customer_user_id,
    incident_id: incident.id,
    order_ref: started.orderRef,
    provider: started.provider ?? "bankid",
    tic_session_id: started.sessionId,
    auto_start_token: started.autoStartToken,
    qr_start_token: started.qrStartToken ?? null,
    qr_start_secret: started.qrStartSecret ?? null,
    subscription_token: started.subscriptionToken ?? null,
    session_expires_at: started.sessionExpiresAt ?? null,
    status: "pending",
    environment: ctx.config.bankid.env,
    purpose,
    callback_state: bankidState(ctx.tenantId, incident.id, flow),
    raw_status: { started, flow, signedPayload },
  });
}

async function handleBankidResult(
  ctx: ApiContext,
  session: BankidSessionRecord,
  result: BankidCollectResult,
  fromWebhook = false,
): Promise<Record<string, unknown>> {
  await ctx.repo.updateBankidSession(session.id, {
    status: result.status,
    hint_code: result.hintCode ?? null,
    completed_at: result.status === "complete" ? result.completedAt ?? new Date().toISOString() : null,
    webhook_received_at: fromWebhook ? new Date().toISOString() : undefined,
    raw_status: result.raw ?? result,
  });

  if (result.status === "complete" && result.completionData && session.status !== "complete") {
    const incident = session.incident_id && session.tenant_id
      ? await ctx.repo.getIncident(session.tenant_id, session.incident_id)
      : null;
    const userId = session.user_id ?? incident?.customer_user_id;
    if (!userId) throw new AppError("internal_error", "BankID session is not linked to a user");
    const signedPayload = signedPayloadForIncident(
      incident ?? ({ id: session.incident_id, case_number: null } as IncidentRecord),
      session.purpose,
    );
    const signature = buildSignatureRecord({
      tenantId: session.tenant_id ?? ctx.tenantId,
      userId,
      incidentId: session.incident_id,
      orderRef: result.orderRef,
      environment: ctx.config.bankid.env,
      pepper: ctx.config.encryptionKey,
      signedPayload,
      completion: result.completionData,
      ip: ctx.ip,
    });
    const saved = await ctx.repo.recordBankidSignature({
      ...signature,
      tic_session_id: session.tic_session_id ?? result.sessionId,
    });
    if (session.incident_id) await ctx.repo.setIncidentBankidVerified(session.incident_id);
    await ctx.repo.recordAudit({
      tenant_id: session.tenant_id ?? ctx.tenantId,
      action: "sign",
      entity_type: "bankid_signature",
      entity_id: saved.id,
      fields: ["tic_session_id", "signed_payload_hash"],
    });
    await enqueueWebhookEvent(ctx, "incident.bankid_verified", {
      incident_id: session.incident_id,
      case_number: incident?.case_number ?? null,
      session_id: session.tic_session_id ?? result.sessionId,
    });
    if (incident) {
      const contact = await ctx.repo.getCustomerContact(incident.id);
      await sendEmail(ctx, {
        to: contact?.email,
        subject: `BankID klart för ärende ${incident.case_number ?? incident.id}`,
        html: `<p>Din BankID-verifiering är klar.</p><p>Ärende: ${escapeHtml(incident.case_number ?? incident.id)}</p>`,
        incidentId: incident.id,
      });
    }
  }

  return {
    session_id: session.tic_session_id ?? result.sessionId,
    status: result.status,
    hint_code: result.hintCode ?? null,
    message: result.message ?? null,
    bankid_verified: result.status === "complete",
  };
}

function publicStartBody(started: BankidStartResult): Record<string, unknown> {
  return {
    status: "pending",
    session_id: started.sessionId,
    order_ref: started.orderRef,
    auto_start_token: started.autoStartToken,
    qr_start_token: started.qrStartToken ?? null,
    qr_start_secret: started.qrStartSecret ?? null,
    subscription_token: started.subscriptionToken ?? null,
    session_expires_at: started.sessionExpiresAt ?? null,
  };
}

function signedPayloadForIncident(incident: Pick<IncidentRecord, "id" | "case_number">, purpose: string): Record<string, unknown> {
  return {
    incident_id: incident.id,
    case_number: incident.case_number,
    purpose,
    payload_hash: sha256Hex(JSON.stringify({ incident_id: incident.id, case_number: incident.case_number, purpose })),
  };
}

function userVisibleBankidText(incident: IncidentRecord, purpose: string): string {
  return [
    `# Resqly bärgningsärende`,
    `Jag godkänner att Resqly behandlar detta ärende och delar nödvändiga uppgifter med valt försäkringsbolag och tilldelat bärgningsbolag.`,
    ``,
    `Ärendenummer: ${incident.case_number ?? incident.id}`,
    `Syfte: ${purpose}`,
  ].join("\n");
}

function requiredEndUserIp(ctx: ApiContext): string {
  const forwarded = ctx.headers?.["x-forwarded-for"]?.split(",")[0]?.trim();
  const ip = forwarded || ctx.ip;
  if (!ip) throw new AppError("bad_request", "End-user IP is required for BankID");
  return ip;
}

function callbackUrl(ctx: ApiContext): string | undefined {
  const base = ctx.config.bankid.tic?.callbackBaseUrl?.replace(/\/+$/, "");
  return base ? `${base}/api/v1/bankid/callback` : undefined;
}

function ticWebhookUrl(ctx: ApiContext): string | undefined {
  const base = ctx.config.bankid.tic?.callbackBaseUrl?.replace(/\/+$/, "");
  return base ? `${base}/api/v1/tic/webhook` : undefined;
}

function bankidState(tenantId: string, incidentId: string, flow: "auth" | "sign"): string {
  return Buffer.from(JSON.stringify({ tenant_id: tenantId, incident_id: incidentId, flow })).toString("base64url");
}
