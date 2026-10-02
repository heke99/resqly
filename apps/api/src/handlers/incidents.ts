import { z } from "zod";
import {
  addEvidenceInputSchema,
  bankidSignInputSchema,
  createIncidentInputSchema,
  requestTowInputSchema,
} from "@resqly/types";
import { AppError, normalizePhoneE164, notFound } from "@resqly/utils";
import {
  buildSignatureRecord,
  getBankidProvider,
  verifyTicWebhookSignature,
  redactBankidValue,
  type BankidCollectResult,
  type BankidStartResult,
} from "@resqly/bankid";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import type { BankidSessionRecord, IncidentRecord } from "../repo/types";
import { runDispatchForJob } from "./dispatch";
import { enqueueWebhookEvent, escapeHtml } from "../services/notifications";
import { apiActorFields } from "../services/audit";

const bankidStartSchema = z.object({
  purpose: z.string().min(1).default("Verifiera bärgningsärende"),
  personal_number: z.string().optional(),
  callback_url: z.string().url().optional(),
});

export async function createIncident(ctx: ApiContext, body: unknown): Promise<RouteResult> {
  const input = createIncidentInputSchema.parse(body);
  const result = await ctx.repo.createIncidentWorkflow(
    workflowActor(ctx),
    input,
    input.pickup
      ? [{ kind: "pickup", ...input.pickup, address: input.pickup_address ?? null }]
      : [],
  );
  return {
    status: result.replay ? 200 : 201,
    body: { ...result },
    headers: result.replay ? { "x-idempotent-replay": "true" } : undefined,
  };
}

function workflowActor(ctx: ApiContext) {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId ?? null,
    apiClientId:
      !ctx.userId && !["public", "user-token"].includes(ctx.apiClientId) ? ctx.apiClientId : null,
    key: ctx.idempotencyKey ?? ctx.requestId,
    correlationId: ctx.requestId,
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
    uploaded_by: ctx.userId ?? null,
    uploaded_by_api_client_id:
      !ctx.userId && ctx.apiClientId && !["public", "user-token"].includes(ctx.apiClientId)
        ? ctx.apiClientId
        : null,
  });
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    ...apiActorFields(ctx),
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
  if (!incident || (ctx.userId && ctx.userId !== incident.customer_user_id))
    throw notFound("Incident not found");
  const payload = await ctx.repo.getBankidIncidentPayload(
    incident.id,
    incident.customer_user_id,
    input.purpose,
  );
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
  await persistBankidSession(ctx, incident, input.purpose, started, "auth", payload);
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
  if (!incident || (ctx.userId && ctx.userId !== incident.customer_user_id))
    throw notFound("Incident not found");

  const provider = getBankidProvider(ctx.config.bankid);
  const signedPayload = await ctx.repo.getBankidIncidentPayload(
    incident.id,
    incident.customer_user_id,
    input.purpose,
  );

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
  const stored = await persistBankidSession(
    ctx,
    incident,
    input.purpose,
    started,
    "sign",
    signedPayload,
  );
  if (provider.environment !== "production") {
    let result = await provider.poll(started.sessionId);
    for (
      let attempt = 0;
      attempt < 5 && !["complete", "failed"].includes(result.status);
      attempt++
    ) {
      result = await provider.poll(started.sessionId);
    }
    if (result.status !== "complete" || !result.completionData)
      throw new AppError("dependency_unavailable", "BankID signing did not complete");
    return {
      status: 200,
      body: { ...(await handleBankidResult(ctx, stored, result)), order_ref: started.orderRef },
    };
  }
  await ctx.repo.recordAudit({
    tenant_id: ctx.tenantId,
    ...apiActorFields(ctx),
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

export async function pollBankidSession(ctx: ApiContext, sessionId: string): Promise<RouteResult> {
  const session = await ctx.repo.getBankidSessionById(sessionId);
  if (
    !session ||
    session.tenant_id !== ctx.tenantId ||
    (ctx.userId && session.user_id !== ctx.userId)
  )
    throw notFound("BankID session not found");
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
  if (
    !session ||
    session.tenant_id !== ctx.tenantId ||
    (ctx.userId && session.user_id !== ctx.userId)
  )
    throw notFound("BankID session not found");
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
  if (
    !session ||
    session.tenant_id !== ctx.tenantId ||
    (ctx.userId && session.user_id !== ctx.userId)
  )
    throw notFound("BankID session not found");
  const provider = getBankidProvider(ctx.config.bankid);
  await provider.cancel(session.tic_session_id ?? session.order_ref ?? sessionId);
  await ctx.repo.updateBankidSession(session.id, {
    status: "cancelled",
    raw_status: { cancelled_at: new Date().toISOString() },
  });
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
  if (["completed", "closed", "cancelled", "rejected"].includes(incident.status)) {
    throw new AppError(
      "conflict",
      `A tow cannot be requested for an incident with status ${incident.status}`,
    );
  }

  if (incident.requires_bankid && !incident.bankid_verified) {
    throw new AppError("conflict", "BankID verification is required before requesting a tow");
  }
  if (input.payer_type === "insurance_company" && !incident.insurance_company_id) {
    throw new AppError(
      "conflict",
      "Insurance-funded towing requires an insurance company linked to the incident",
    );
  }

  const contact = await ctx.repo.getCustomerContact(incident.id);
  const normalizedPhone = normalizePhoneE164(contact?.phone ?? "");
  if (!contact || contact.name.trim().length < 2 || !normalizedPhone) {
    throw new AppError(
      "conflict",
      "Customer full name and a valid mobile number are required before dispatch",
    );
  }

  const requested = await ctx.repo.requestTowWorkflow(workflowActor(ctx), incident.id, input);
  const { job, created } = requested;
  if (!["created", "matching"].includes(job.status)) {
    return {
      status: 200,
      body: {
        tow_job_id: job.id,
        status: job.status,
        offered_drivers: [],
        requires_manual_review: job.status === "manual_review",
        replay: true,
      },
    };
  }
  const coords = await ctx.repo.getIncidentCoordinates(incident.id);
  const pickup = coords.pickup;
  if (!pickup) throw new AppError("conflict", "Pickup coordinates are required for dispatch");
  const claim = await ctx.repo.claimTowDispatch(job.id);
  if (!claim.claimed) {
    return {
      status: 202,
      body: {
        tow_job_id: job.id,
        status: claim.status,
        dispatch_in_progress: ["created", "matching"].includes(claim.status),
        replay: true,
      },
    };
  }

  let outcome;
  try {
    outcome = await runDispatchForJob(ctx, {
      job,
      pickup,
      payerType: job.payer_type as "insurance_company" | "customer_private",
      priority: (["normal", "high", "urgent"].includes(job.priority) ? job.priority : "normal") as
        "normal" | "high" | "urgent",
      strategy: input.dispatch_strategy,
      problemType: incident.problem_type,
      actorUserId: ctx.userId ?? null,
      actorApiClientId:
        !ctx.userId && ctx.apiClientId && !["public", "user-token"].includes(ctx.apiClientId)
          ? ctx.apiClientId
          : null,
    });
    await ctx.repo.recordDispatchAttempt(job.id, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = await ctx.repo.recordDispatchAttempt(job.id, message);
    if (attempt.status === "manual_review") {
      return {
        status: 202,
        body: {
          tow_job_id: job.id,
          status: "manual_review",
          offered_drivers: [],
          requires_manual_review: true,
          strategy: input.dispatch_strategy ?? null,
        },
      };
    }
    throw new AppError("dependency_unavailable", "Dispatch failed and will be retried", {
      tow_job_id: job.id,
      attempts: attempt.attempts,
    });
  }

  return {
    status: created ? 201 : 200,
    body: {
      tow_job_id: job.id,
      status: outcome.status,
      offered_drivers: outcome.offeredDrivers,
      requires_manual_review: outcome.requiresManualReview,
      strategy: outcome.strategy,
      resumed: !created,
    },
  };
}

/**
 * Browser redirect target after a hosted BankID flow (TIC redirects the
 * end-user here). We only confirm session state and hand the user back to
 * the app — the authoritative completion comes from poll/collect/webhook.
 * Response is a friendly Swedish HTML page, never raw errors.
 */
export async function bankidCallback(
  ctx: ApiContext,
  query: URLSearchParams,
): Promise<RouteResult> {
  const sessionId = query.get("sessionId") ?? query.get("session_id") ?? null;

  let completed = false;
  if (sessionId) {
    try {
      const session = await ctx.repo.getBankidSessionById(sessionId);
      if (session) {
        const provider = getBankidProvider(ctx.config.bankid);
        const result = await provider.collect(
          session.tic_session_id ?? session.order_ref ?? sessionId,
        );
        const effectiveCtx = session.tenant_id ? { ...ctx, tenantId: session.tenant_id } : ctx;
        const handled = await handleBankidResult(effectiveCtx, session, result);
        completed = handled.bankid_verified === true;
      }
    } catch {
      // Never surface technical errors to the end user on this page; the
      // app keeps polling and shows the real state.
    }
  }

  const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_CUSTOMER_WEB_URL || null;
  const heading = completed ? "Verifieringen är klar" : "Tack!";
  const message = completed
    ? "Din BankID-verifiering är genomförd. Du kan nu gå tillbaka till appen."
    : "Du kan nu gå tillbaka till appen för att se status på din verifiering.";
  const link = appUrl ? `<p><a href="${escapeHtml(appUrl)}">Tillbaka till appen</a></p>` : "";
  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
    rawBody: `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BankID</title></head><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc"><main style="text-align:center;padding:24px;max-width:420px"><h1 style="font-size:22px">${heading}</h1><p style="color:#334155">${message}</p>${link}</main></body></html>`,
  };
}

async function persistBankidSession(
  ctx: ApiContext,
  incident: IncidentRecord,
  purpose: string,
  started: BankidStartResult,
  flow: "auth" | "sign",
  signedPayload: Record<string, unknown>,
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
    bound_flow: flow,
    bound_payload_text: JSON.stringify(signedPayload),
    raw_status: { started: redactBankidValue(started), flow },
  });
}

async function handleBankidResult(
  ctx: ApiContext,
  session: BankidSessionRecord,
  result: BankidCollectResult,
  fromWebhook = false,
): Promise<Record<string, unknown>> {
  if (result.status !== "complete" || !result.completionData) {
    await ctx.repo.updateBankidSession(session.id, {
      status: result.status,
      hint_code: result.hintCode ?? null,
      webhook_received_at: fromWebhook ? new Date().toISOString() : undefined,
      raw_status: redactBankidValue(result.raw ?? result),
    });
    const current = await ctx.repo.getBankidSessionById(session.id);
    const currentIncident =
      current?.incident_id && current.tenant_id
        ? await ctx.repo.getIncident(current.tenant_id, current.incident_id)
        : null;
    return {
      session_id: session.tic_session_id ?? result.sessionId,
      status: current?.status ?? result.status,
      hint_code: current?.status === "complete" ? null : (result.hintCode ?? null),
      message: current?.status === "complete" ? null : (result.message ?? null),
      bankid_verified: current?.status === "complete" && Boolean(currentIncident?.bankid_verified),
      replay: current?.status === "complete",
    };
  }

  const incident =
    session.incident_id && session.tenant_id
      ? await ctx.repo.getIncident(session.tenant_id, session.incident_id)
      : null;
  const userId = session.user_id ?? incident?.customer_user_id;
  if (!userId) throw new AppError("internal_error", "BankID session is not linked to a user");

  if (!session.bound_payload_text)
    throw new AppError("conflict", "BankID session must be restarted");
  const signedPayload = JSON.parse(session.bound_payload_text) as Record<string, unknown>;
  const signature = buildSignatureRecord({
    tenantId: session.tenant_id ?? ctx.tenantId,
    userId,
    incidentId: session.incident_id,
    orderRef: result.orderRef,
    environment: ctx.config.bankid.env,
    pepper: ctx.config.encryptionKey,
    signedPayload: session.bound_payload_text,
    completion: result.completionData,
    ip: ctx.ip,
  });

  const completed = await ctx.repo.completeBankidSession({
    sessionId: session.id,
    signature: {
      ...signature,
      tic_session_id: session.tic_session_id ?? result.sessionId,
    },
    businessPayload: signedPayload,
    result: {
      status: result.status,
      hintCode: result.hintCode ?? null,
      completedAt: result.completedAt ?? new Date().toISOString(),
      sessionId: result.sessionId,
      orderRef: result.orderRef,
      raw: redactBankidValue(result.raw ?? result),
    },
    fromWebhook,
  });

  // Audit and webhook/email intents are committed inside the completion RPC.

  return {
    session_id: session.tic_session_id ?? result.sessionId,
    status: "complete",
    hint_code: null,
    message: result.message ?? null,
    bankid_verified: true,
    replay: !completed.newlyProcessed,
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
  if (!ip && ctx.config.bankid.env !== "production") return "127.0.0.1";
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
  return Buffer.from(
    JSON.stringify({ tenant_id: tenantId, incident_id: incidentId, flow }),
  ).toString("base64url");
}
