import { z } from "zod";
import {
  towJobCompleteInputSchema,
  towJobLocationInputSchema,
  towJobStatusInputSchema,
} from "@resqly/types";
import { AppError, notFound, badRequest, forbidden } from "@resqly/utils";
import {
  buildCompletionReport,
  transitionTowJob,
  SHAREABLE_CUSTOMER_FIELDS,
} from "@resqly/tow";
import { buildInvoiceBasis, type PriceList } from "@resqly/billing";
import { MapsClient, buildEtaSnapshot } from "@resqly/maps";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import { enqueueWebhookEvent, sendEmail } from "../services/notifications";
import { apiActorFields } from "../services/audit";

const acceptSchema = z.object({});
const rejectSchema = z.object({ reason: z.string().optional() });

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024; // 10 MB
const EVIDENCE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};
const evidenceUploadSchema = z.object({
  content_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic"]),
  size_bytes: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
  phase: z.enum(["before", "during", "after"]).optional(),
});
const evidenceCompleteSchema = evidenceUploadSchema.extend({
  storage_path: z.string().min(1).max(500),
});

function requireAuthenticatedDriver(ctx: ApiContext): string {
  if (!ctx.driverId) throw forbidden("Authenticated driver token is required for this action");
  return ctx.driverId;
}

function assertAssignedDriver(jobDriverId: string | null, driverId: string): void {
  if (jobDriverId !== driverId) {
    throw forbidden(jobDriverId ? "This job is assigned to another driver" : "Accept the job before changing it");
  }
}

/**
 * Resolve a tow job for the current auth lane.
 *
 * Partner API callers are tenant-scoped (tow_jobs.tenant_id is the insurer
 * tenant). Driver user-token callers belong to the tow company tenant, so the
 * job is looked up by id and authorization is enforced against the driver
 * (assignment or a pending offer) instead.
 */
async function loadJobForContext(ctx: ApiContext, jobId: string) {
  if (ctx.apiClientId === "user-token") {
    const driverId = requireAuthenticatedDriver(ctx);
    const job = await ctx.repo.getTowJobById(jobId);
    if (!job) throw notFound("Tow job not found");
    if (job.driver_id !== driverId) {
      const offer = await ctx.repo.getOfferForDriver(jobId, driverId);
      if (!offer || offer.status !== "pending" || Date.parse(offer.expires_at) <= Date.now()
        || !["matching", "offered"].includes(job.status)) throw notFound("Tow job not found");
    }
    return job;
  }
  const job = await ctx.repo.getTowJob(ctx.tenantId, jobId);
  if (!job) throw notFound("Tow job not found");
  return job;
}

const DEFAULT_PRICE_LIST: PriceList = {
  start_fee_minor: 0,
  per_km_minor: 0,
  per_waiting_minute_minor: 0,
  failed_trip_minor: 0,
  on_call_surcharge_minor: 0,
  heavy_tow_minor: 0,
  currency: "SEK",
};

export async function listTowJobs(
  ctx: ApiContext,
  query: URLSearchParams,
): Promise<RouteResult> {
  const status = query.get("status") ?? undefined;
  const limit = Math.min(200, Number(query.get("limit") ?? "50") || 50);
  const jobs = await ctx.repo.listTowJobs(ctx.tenantId, { status, limit });
  return { status: 200, body: { jobs } };
}

export async function getTowJob(ctx: ApiContext, id: string): Promise<RouteResult> {
  const job = await loadJobForContext(ctx, id);
  return { status: 200, body: job };
}

const ACCEPT_FAILURE_MESSAGES: Record<string, string> = {
  no_pending_offer: "No pending offer for this driver on this job",
  already_assigned: "This job has already been accepted by another driver",
  job_not_offerable: "This job is no longer available",
  job_not_found: "Tow job not found",
  offer_expired: "This offer has expired",
  forbidden: "You are not allowed to accept this job",
  customer_contact_missing: "Customer contact details are incomplete",
  resource_busy: "The driver or vehicle is already assigned",
};

/** Friendly Swedish messages the driver app can show directly. */
const ACCEPT_FAILURE_USER_MESSAGES: Record<string, string> = {
  no_pending_offer: "Erbjudandet är inte längre tillgängligt.",
  already_assigned: "Uppdraget har redan tagits av en annan förare.",
  job_not_offerable: "Uppdraget är inte längre tillgängligt.",
  job_not_found: "Uppdraget kunde inte hittas.",
  offer_expired: "Erbjudandet har gått ut.",
  forbidden: "Du kan inte acceptera det här uppdraget.",
  customer_contact_missing: "Kundens kontaktuppgifter är inte kompletta. Be trafikledningen kontrollera ärendet.",
  resource_busy: "Föraren eller bärgningsbilen har redan ett aktivt uppdrag.",
};

/**
 * Shared accept flow used by both job-centric and offer-centric endpoints.
 * Acceptance is race-safe (DB locks the job + cancels other offers); customer
 * PII is shared exactly once, only after a successful accept.
 */
export async function acceptJobForDriver(
  ctx: ApiContext,
  jobId: string,
  driverId: string,
): Promise<RouteResult> {
  const actorUserId = ctx.driverUserId ?? ctx.userId;
  if (!actorUserId) throw forbidden("Authenticated driver token is required");
  const result = await ctx.repo.acceptOffer(jobId, driverId, actorUserId, ctx.requestId);
  if (!result.accepted) {
    const reason = result.reason ?? "";
    throw new AppError("conflict", ACCEPT_FAILURE_MESSAGES[reason] ?? "Cannot accept this offer", {
      reason,
      user_message: ACCEPT_FAILURE_USER_MESSAGES[reason] ?? "Uppdraget kunde inte accepteras. Försök igen.",
    });
  }
  return { status: 200, body: { status: "accepted", customer_shared: true,
    shared_fields: SHAREABLE_CUSTOMER_FIELDS, tow_company_id: result.towCompanyId, repaired: false } };
}

export async function acceptTowJob(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  acceptSchema.parse(body);
  const driverId = requireAuthenticatedDriver(ctx);
  return acceptJobForDriver(ctx, id, driverId);
}

/** Create a one-time direct upload token. The driver uploads bytes directly
 * to private Storage so large mobile photos never pass through the JSON API. */
export async function createTowJobEvidenceUpload(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = evidenceUploadSchema.parse(body);
  const driverId = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  assertAssignedDriver(job.driver_id, driverId);

  const ext = EVIDENCE_EXTENSIONS[input.content_type];
  const path = `${job.id}/${driverId}/${crypto.randomUUID()}.${ext}`;
  const upload = await ctx.repo.createTowEvidenceUpload(path);
  return {
    status: 201,
    body: {
      storage_path: upload.path,
      upload_token: upload.token,
      bucket: "tow-evidence",
      max_bytes: MAX_EVIDENCE_BYTES,
    },
  };
}

/** Register an uploaded object only after the server has verified path, owner,
 * type and size. Safe to retry because storage_path is unique. */
export async function completeTowJobEvidenceUpload(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = evidenceCompleteSchema.parse(body);
  const driverId = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  assertAssignedDriver(job.driver_id, driverId);

  const expectedPrefix = `${job.id}/${driverId}/`;
  if (!input.storage_path.startsWith(expectedPrefix) || input.storage_path.includes("..")) {
    throw forbidden("Invalid evidence storage path");
  }
  const expectedExt = EVIDENCE_EXTENSIONS[input.content_type];
  if (!input.storage_path.toLowerCase().endsWith(`.${expectedExt}`)) {
    throw badRequest("File extension does not match content type");
  }

  const object = await ctx.repo.getTowEvidenceObject(input.storage_path);
  if (!object || object.size == null) throw badRequest("Uploaded file could not be verified");
  if (object.size <= 0 || object.size > MAX_EVIDENCE_BYTES || object.size !== input.size_bytes) {
    throw badRequest("Uploaded file size does not match the declared size");
  }
  if (object.contentType && object.contentType !== input.content_type) {
    throw badRequest("Uploaded file type does not match the declared type");
  }

  const row = await ctx.repo.createTowJobEvidence({
    tenant_id: job.tenant_id,
    tow_job_id: job.id,
    driver_id: driverId,
    storage_path: input.storage_path,
    content_type: input.content_type,
    phase: input.phase ?? "during",
  });
  await ctx.repo.recordAudit({
    tenant_id: job.tenant_id,
    ...apiActorFields(ctx),
    action: "create",
    entity_type: "tow_job_evidence",
    entity_id: row.id,
    fields: ["storage_path", "content_type", "phase"],
    metadata: { tow_job_id: job.id, driver_id: driverId, size_bytes: object.size },
  });
  return { status: 201, body: { evidence_id: row.id } };
}

export async function rejectTowJob(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const { reason } = rejectSchema.parse(body);
  const driver_id = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  const rejected = await ctx.repo.rejectOffer(id, driver_id, reason ?? null);
  if (!rejected) {
    throw new AppError("conflict", "Offer is no longer pending", {
      user_message: "Erbjudandet är inte längre tillgängligt.",
    });
  }
  await ctx.repo.recordAudit({
    tenant_id: job.tenant_id,
    ...apiActorFields(ctx),
    action: "update",
    entity_type: "tow_job_offer",
    entity_id: id,
    fields: ["status"],
    metadata: { driver_id, status: "rejected", reason },
  });
  return { status: 200, body: { status: "rejected" } };
}

export async function updateTowJobStatus(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = towJobStatusInputSchema.parse(body);
  const driver_id = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  assertAssignedDriver(job.driver_id, driver_id);
  const event = transitionTowJob({
    towJobId: id,
    from: job.status,
    to: input.status,
    reason: input.reason,
    actorUserId: ctx.userId ?? ctx.driverUserId ?? null,
    actorApiClientId: ctx.userId || ctx.driverUserId ? null : (ctx.apiClientId ?? null),
    actorKind: ctx.userId || ctx.driverUserId ? "user" : ctx.apiClientId ? "api_client" : "system",
  });
  await ctx.repo.transitionTowJobStatus(event);
  const eventByStatus: Record<string, string> = {
    driver_en_route: "tow.driver_en_route",
    driver_arrived: "tow.driver_arrived",
    cancelled: "tow.cancelled",
    failed: "tow.failed",
  };
  const webhookEvent = eventByStatus[input.status];
  if (webhookEvent) {
    await enqueueWebhookEvent(ctx, webhookEvent, {
      tow_job_id: id,
      incident_id: job.incident_id,
      from_status: job.status,
      to_status: input.status,
    });
  }
  return { status: 200, body: { status: input.status } };
}

export async function updateTowJobLocation(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = towJobLocationInputSchema.parse(body);
  const driver_id = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  assertAssignedDriver(job.driver_id, driver_id);
  const contact = await ctx.repo.getCustomerContact(job.incident_id);
  if (!contact) throw badRequest("Pickup location unknown");

  const maps = new MapsClient({
    serverKey: ctx.config.maps.serverKey,
    routesEnabled: ctx.config.maps.routesEnabled,
    routeMatrixEnabled: ctx.config.maps.routeMatrixEnabled,
    tenantId: ctx.tenantId,
  });
  const eta = await maps.calculateRouteEta(input.location, contact.pickup);
  await ctx.repo.addEtaSnapshot(
    buildEtaSnapshot({ towJobId: id, driverId: job.driver_id, eta }),
  );
  return { status: 200, body: { eta_seconds: eta.etaSeconds, distance_meters: eta.distanceMeters, degraded: eta.degraded } };
}

export async function getTowJobEta(ctx: ApiContext, id: string): Promise<RouteResult> {
  await loadJobForContext(ctx, id);
  const eta = await ctx.repo.getLatestEta(id);
  if (!eta) return { status: 200, body: { eta: null } };
  return {
    status: 200,
    body: {
      eta_seconds: eta.eta_seconds,
      distance_meters: eta.distance_meters,
      source: eta.source,
      degraded: eta.degraded,
      updated_at: eta.created_at,
    },
  };
}

export async function completeTowJob(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const input = towJobCompleteInputSchema.parse(body);
  const driverId = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  assertAssignedDriver(job.driver_id, driverId);

  const report = buildCompletionReport({
    tenantId: job.tenant_id,
    towJobId: id,
    driverId,
    input,
  });

  const snapshot = (job.price_snapshot ?? null) as {
    price_list?: PriceList;
    factors?: { evening_night?: boolean; weekend?: boolean; distance_km?: number | null };
  } | null;
  const priceList =
    snapshot?.price_list ??
    (job.tow_company_id ? await ctx.repo.getActivePriceList(job.tow_company_id) : null) ??
    DEFAULT_PRICE_LIST;
  const invoice = buildInvoiceBasis({
    payerType: job.payer_type === "customer_private" ? "customer_private" : "insurance_company",
    priceList,
    distanceKm: snapshot?.factors?.distance_km ?? undefined,
    eveningNight: snapshot?.factors?.evening_night ?? false,
    weekend: snapshot?.factors?.weekend ?? false,
    waitingMinutes: input.waiting_minutes,
    failedTrip: input.failed_trip,
  });
  const invoiceRow = {
    tenant_id: job.tenant_id,
    tow_job_id: id,
    payer_type: invoice.payer_type,
    status: "ready",
    lines: invoice.lines,
    subtotal_minor: invoice.subtotal_minor,
    vat_minor: invoice.vat_minor,
    total_minor: invoice.total_minor,
    currency: invoice.currency,
  };

  // One database transaction locks the job, validates assignment/state,
  // upserts report + invoice and advances every status event exactly once.
  const finalized = await ctx.repo.finalizeTowJob(id, driverId, report, invoiceRow);

  if (!finalized.already_finalized) {
    await ctx.repo.recordAudit({
      tenant_id: job.tenant_id,
      ...apiActorFields(ctx),
      action: "status_change",
      entity_type: "tow_job",
      entity_id: id,
      fields: ["completion_report", "invoice_basis", "status"],
      metadata: { status: finalized.status, total_minor: finalized.total_minor },
    });
    // The tow.completed webhook outbox is inserted inside finalize_tow_job,
    // in the same transaction as the report, invoice and status change.
    const contact = await ctx.repo.getCustomerContact(job.incident_id);
    await sendEmail(ctx, {
      to: contact?.email,
      subject: "Bärgningsärendet är avslutat",
      html: `<p>Ditt bärgningsärende är avslutat.</p><p>Tack för att du använde tjänsten.</p>`,
      incidentId: job.incident_id,
      towJobId: id,
      dedupeKey: `email:tow_completed:${id}`,
    });
  }

  return {
    status: 200,
    body: {
      status: finalized.status,
      invoice_total_minor: finalized.total_minor,
      completion_recorded: true,
      idempotent_replay: finalized.already_finalized,
    },
  };
}
