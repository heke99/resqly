import { z } from "zod";
import {
  towJobCompleteInputSchema,
  towJobLocationInputSchema,
  towJobStatusInputSchema,
} from "@resqly/types";
import { AppError, notFound, badRequest, forbidden } from "@resqly/utils";
import {
  buildCustomerShare,
  buildCompletionReport,
  transitionTowJob,
  SHAREABLE_CUSTOMER_FIELDS,
} from "@resqly/tow";
import { buildCustomerShareAudit } from "@resqly/audit";
import { buildInvoiceBasis, estimatePrivateTowPrice, type PriceList } from "@resqly/billing";
import { MapsClient, buildEtaSnapshot, haversineMeters } from "@resqly/maps";
import type { ApiContext } from "../context";
import type { RouteResult } from "../http/router";
import { enqueueWebhookEvent, escapeHtml, sendEmail } from "../services/notifications";

const acceptSchema = z.object({});
const rejectSchema = z.object({ reason: z.string().optional() });

function requireAuthenticatedDriver(ctx: ApiContext): string {
  if (!ctx.driverId) throw forbidden("Authenticated driver token is required for this action");
  return ctx.driverId;
}

function assertAssignedDriver(jobDriverId: string | null, driverId: string): void {
  if (jobDriverId && jobDriverId !== driverId) throw forbidden("This job is assigned to another driver");
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
      if (!offer) throw notFound("Tow job not found");
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
};

/** Friendly Swedish messages the driver app can show directly. */
const ACCEPT_FAILURE_USER_MESSAGES: Record<string, string> = {
  no_pending_offer: "Erbjudandet är inte längre tillgängligt.",
  already_assigned: "Uppdraget har redan tagits av en annan förare.",
  job_not_offerable: "Uppdraget är inte längre tillgängligt.",
  job_not_found: "Uppdraget kunde inte hittas.",
  offer_expired: "Erbjudandet har gått ut.",
  forbidden: "Du kan inte acceptera det här uppdraget.",
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
  const job = await loadJobForContext(ctx, jobId);

  const result = await ctx.repo.acceptOffer(jobId, driverId);
  if (!result.accepted) {
    const reason = result.reason ?? "";
    throw new AppError("conflict", ACCEPT_FAILURE_MESSAGES[reason] ?? "Cannot accept this offer", {
      reason,
      user_message: ACCEPT_FAILURE_USER_MESSAGES[reason] ?? "Uppdraget kunde inte accepteras. Försök igen.",
    });
  }

  // Idempotent re-accept by the winning driver (e.g. a mobile retry after a
  // network hiccup). The customer share already exists — do not duplicate it.
  if (result.reason === "already_accepted_by_driver") {
    return {
      status: 200,
      body: {
        status: "accepted",
        customer_shared: true,
        shared_fields: SHAREABLE_CUSTOMER_FIELDS,
        tow_company_id: result.towCompanyId,
      },
    };
  }

  // Freeze the accepted price terms for private jobs (the customer's price
  // must never change because the company edits its price list afterwards).
  if (job.payer_type === "customer_private" && result.towCompanyId) {
    await snapshotAcceptedPrice(ctx, jobId, job, result.towCompanyId);
  }

  // ---- The critical step: share customer data ONLY now, after accept. ----
  const contact = await ctx.repo.getCustomerContact(job.incident_id);
  if (!contact) throw new AppError("internal_error", "Customer contact unavailable");

  const share = buildCustomerShare({
    tenantId: job.tenant_id,
    towJobId: jobId,
    driverId,
    jobStatus: "accepted",
    customer: { name: contact.name, phone: contact.phone, email: contact.email },
    registrationNumber: contact.registration_number,
    problemSummary: contact.problem_summary,
    pickup: contact.pickup,
    pickupAddress: contact.pickup_address,
    destinationAddress: contact.destination_address,
    customerNotes: contact.customer_notes,
  });
  await ctx.repo.createCustomerShare(share);

  await ctx.repo.recordAudit(
    buildCustomerShareAudit({
      tenantId: job.tenant_id,
      actorUserId: driverId,
      driverId,
      towJobId: jobId,
      fields: [...SHAREABLE_CUSTOMER_FIELDS],
      reason: "driver accepted job",
      ip: ctx.ip,
    }),
  );
  await enqueueWebhookEvent(ctx, "tow.driver_accepted", {
    tow_job_id: jobId,
    incident_id: job.incident_id,
    driver_id: driverId,
    tow_company_id: result.towCompanyId,
  });
  await sendEmail(ctx, {
    to: contact.email,
    subject: "Bärgare har accepterat ditt ärende",
    html: `<p>En bärgare har accepterat ditt ärende.</p><p>Fordon: ${escapeHtml(contact.registration_number)}</p>`,
    incidentId: job.incident_id,
    towJobId: jobId,
  });

  return {
    status: 200,
    body: {
      status: "accepted",
      customer_shared: true,
      shared_fields: SHAREABLE_CUSTOMER_FIELDS,
      tow_company_id: result.towCompanyId,
    },
  };
}

interface PriceSnapshot {
  tow_company_id: string;
  price_list: PriceList;
  estimate: {
    lines: unknown[];
    subtotal_minor: number;
    vat_minor: number;
    total_minor: number;
    currency: string;
  };
  factors: { evening_night: boolean; weekend: boolean; distance_km: number | null };
  computed_at: string;
}

/**
 * Best-effort price snapshot at accept time. Uses the accepting company's
 * active price list plus the case's pickup/destination distance (haversine
 * with road factor when route data is unavailable). Never blocks accept.
 */
async function snapshotAcceptedPrice(
  ctx: ApiContext,
  jobId: string,
  job: { incident_id: string; tenant_id: string; price_snapshot?: Record<string, unknown> | null },
  towCompanyId: string,
): Promise<void> {
  try {
    if (job.price_snapshot) return;
    const priceList = await ctx.repo.getActivePriceList(towCompanyId);
    if (!priceList) return;
    const coords = await ctx.repo.getIncidentCoordinates(job.incident_id);
    const distanceKm =
      coords.pickup && coords.destination
        ? Math.round((haversineMeters(coords.pickup, coords.destination) * 1.3) / 100) / 10
        : null;
    const estimate = estimatePrivateTowPrice({ priceList, distanceKm });
    const snapshot: PriceSnapshot = {
      tow_company_id: towCompanyId,
      price_list: priceList,
      estimate: {
        lines: estimate.lines,
        subtotal_minor: estimate.subtotal_minor,
        vat_minor: estimate.vat_minor,
        total_minor: estimate.total_minor,
        currency: estimate.currency,
      },
      factors: estimate.factors,
      computed_at: new Date().toISOString(),
    };
    await ctx.repo.setTowJobPriceSnapshot(jobId, snapshot as unknown as Record<string, unknown>);
    await ctx.repo.recordAudit({
      tenant_id: job.tenant_id,
      action: "update",
      entity_type: "tow_job",
      entity_id: jobId,
      fields: ["price_snapshot"],
      metadata: {
        total_minor: estimate.total_minor,
        currency: estimate.currency,
        distance_km: distanceKm,
        tow_company_id: towCompanyId,
      },
    });
  } catch {
    // Pricing snapshot is best-effort; accept must never fail because of it.
  }
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

export async function rejectTowJob(
  ctx: ApiContext,
  id: string,
  body: unknown,
): Promise<RouteResult> {
  const { reason } = rejectSchema.parse(body);
  const driver_id = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  await ctx.repo.setOfferStatus(id, driver_id, "rejected");
  await ctx.repo.recordAudit({
    tenant_id: job.tenant_id,
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
  });
  await ctx.repo.setTowJobStatus(id, input.status);
  await ctx.repo.addTowJobStatusEvent(event);
  await ctx.repo.recordAudit({
    tenant_id: job.tenant_id,
    action: "status_change",
    entity_type: "tow_job",
    entity_id: id,
    fields: ["status"],
    metadata: { from: job.status, to: input.status },
  });
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
  const driver_id = requireAuthenticatedDriver(ctx);
  const job = await loadJobForContext(ctx, id);
  if (!job.driver_id) throw new AppError("conflict", "Job has no assigned driver");
  assertAssignedDriver(job.driver_id, driver_id);

  // delivered -> completed (allow from transporting/delivered)
  if (job.status === "transporting") {
    await ctx.repo.setTowJobStatus(id, "delivered");
    await ctx.repo.addTowJobStatusEvent({ tow_job_id: id, from_status: "transporting", to_status: "delivered" });
  }
  const fromStatus = job.status === "transporting" ? "delivered" : job.status;
  transitionTowJob({ towJobId: id, from: fromStatus, to: "completed" });
  await ctx.repo.setTowJobStatus(id, "completed");
  await ctx.repo.addTowJobStatusEvent({ tow_job_id: id, from_status: fromStatus, to_status: "completed" });

  const report = buildCompletionReport({
    tenantId: job.tenant_id,
    towJobId: id,
    driverId: job.driver_id,
    input,
  });
  await ctx.repo.createCompletionReport(report);

  // The invoice basis uses the price terms frozen at accept time when
  // available (private jobs), otherwise the company's current price list.
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
  await ctx.repo.createInvoice({
    tenant_id: job.tenant_id,
    tow_job_id: id,
    payer_type: invoice.payer_type,
    status: "ready",
    lines: invoice.lines,
    subtotal_minor: invoice.subtotal_minor,
    vat_minor: invoice.vat_minor,
    total_minor: invoice.total_minor,
    currency: invoice.currency,
  });
  await ctx.repo.setTowJobStatus(id, "invoiced");
  await ctx.repo.addTowJobStatusEvent({ tow_job_id: id, from_status: "completed", to_status: "invoiced" });

  await ctx.repo.recordAudit({
    tenant_id: job.tenant_id,
    action: "status_change",
    entity_type: "tow_job",
    entity_id: id,
    fields: ["completion_report", "invoice_basis"],
  });
  await enqueueWebhookEvent(ctx, "tow.completed", {
    tow_job_id: id,
    incident_id: job.incident_id,
    status: "invoiced",
    invoice_total_minor: invoice.total_minor,
  });
  const contact = await ctx.repo.getCustomerContact(job.incident_id);
  await sendEmail(ctx, {
    to: contact?.email,
    subject: "Bärgningsärendet är avslutat",
    html: `<p>Ditt bärgningsärende är avslutat.</p><p>Status: invoiced</p>`,
    incidentId: job.incident_id,
    towJobId: id,
  });

  return {
    status: 200,
    body: { status: "invoiced", invoice_total_minor: invoice.total_minor, completion_recorded: true },
  };
}
