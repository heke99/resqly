import { z } from "zod";
import { AppError, isAppError, newRequestId, sha256Hex } from "@resqly/utils";
import { Router, type RouteResult } from "./http/router";
import { type AppConfig, type ApiContext, defaultRateLimiter } from "./context";
import * as incidents from "./handlers/incidents";
import * as tow from "./handlers/tow";
import * as eta from "./handlers/eta";
import * as tenant from "./handlers/tenant";
import * as me from "./handlers/me";
import * as drivers from "./handlers/drivers";
import * as dispatch from "./handlers/dispatch";

export interface RawRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
  ip?: string | null;
}

export class App {
  readonly router = new Router<ApiContext>();
  private readonly rateLimiter;

  constructor(readonly config: AppConfig) {
    this.rateLimiter = config.rateLimiter ?? defaultRateLimiter();
    this.registerRoutes();
  }

  private registerRoutes() {
    const r = this.router;
    r.post("/api/v1/incidents", (ctx, a) => incidents.createIncident(ctx, a.body));
    r.get("/api/v1/incidents/:id", (ctx, a) => incidents.getIncident(ctx, a.params.id!));
    r.post("/api/v1/incidents/:id/evidence", (ctx, a) =>
      incidents.addEvidence(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/incidents/:id/bankid/sign", (ctx, a) =>
      incidents.signIncident(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/incidents/:id/request-tow", (ctx, a) =>
      incidents.requestTow(ctx, a.params.id!, a.body),
    );

    r.get("/api/v1/tow/jobs", (ctx, a) => tow.listTowJobs(ctx, a.query));
    r.get("/api/v1/tow/jobs/:id", (ctx, a) => tow.getTowJob(ctx, a.params.id!));
    r.post("/api/v1/tow/jobs/:id/accept", (ctx, a) => tow.acceptTowJob(ctx, a.params.id!, a.body));
    r.post("/api/v1/tow/jobs/:id/reject", (ctx, a) => tow.rejectTowJob(ctx, a.params.id!, a.body));
    r.post("/api/v1/tow/jobs/:id/status", (ctx, a) =>
      tow.updateTowJobStatus(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/tow/jobs/:id/location", (ctx, a) =>
      tow.updateTowJobLocation(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/tow/jobs/:id/complete", (ctx, a) =>
      tow.completeTowJob(ctx, a.params.id!, a.body),
    );
    r.get("/api/v1/tow/jobs/:id/eta", (ctx, a) => tow.getTowJobEta(ctx, a.params.id!));

    r.post("/api/v1/eta/calculate", (ctx, a) => eta.calculateEta(ctx, a.body));
    r.post("/api/v1/eta/matrix", (ctx, a) => eta.calculateEtaMatrix(ctx, a.body));

    r.get("/api/v1/tenant/theme", (ctx) => tenant.getTenantTheme(ctx));
    r.patch("/api/v1/tenant/branding", (ctx, a) => tenant.patchTenantBranding(ctx, a.body));
    r.get("/api/v1/tenant/settings", (ctx) => tenant.getTenantSettings(ctx));
    r.patch("/api/v1/tenant/settings", (ctx, a) => tenant.patchTenantSettings(ctx, a.body));

    // Authenticated end-user role/capability context (mobile + apps).
    r.get("/api/v1/me/role-context", (ctx) => me.getRoleContext(ctx));

    // Driver self-service.
    r.post("/api/v1/drivers/me/online", (ctx) => drivers.goOnline(ctx, true));
    r.post("/api/v1/drivers/me/offline", (ctx) => drivers.goOnline(ctx, false));
    r.post("/api/v1/drivers/me/location", (ctx, a) => drivers.updateLocation(ctx, a.body));
    r.post("/api/v1/drivers/me/device", (ctx, a) => drivers.registerDevice(ctx, a.body));
    r.get("/api/v1/drivers/me/offers", (ctx) => drivers.listOffers(ctx));
    r.post("/api/v1/drivers/offers/:id/accept", (ctx, a) => drivers.acceptOffer(ctx, a.params.id!));
    r.post("/api/v1/drivers/offers/:id/reject", (ctx, a) => drivers.rejectOffer(ctx, a.params.id!, a.body));

    // Manual / re-run dispatch for an existing tow job.
    r.post("/api/v1/dispatch/run", (ctx, a) => dispatch.runDispatch(ctx, a.body));
  }

  async handle(req: RawRequest): Promise<RouteResult> {
    const requestId = newRequestId();
    const url = new URL(req.path, "http://internal");
    const matched = this.router.match(req.method, url.pathname);
    const baseHeaders = { "x-request-id": requestId };

    if (!matched) {
      return { status: 404, body: { error: { code: "not_found", message: "Route not found", request_id: requestId } }, headers: baseHeaders };
    }

    // --- API key authentication ---
    const apiKey =
      extractBearer(req.headers["authorization"]) ?? req.headers["x-api-key"] ?? null;
    if (!apiKey) {
      return unauthorized(requestId);
    }
    const client = await this.config.repo.findApiClientByKeyHash(sha256Hex(apiKey));
    if (!client || !client.active) {
      return unauthorized(requestId);
    }

    // --- Rate limiting per tenant ---
    const rl = this.rateLimiter.check(client.tenantId);
    if (!rl.allowed) {
      return {
        status: 429,
        body: { error: { code: "rate_limited", message: "Rate limit exceeded", request_id: requestId } },
        headers: baseHeaders,
      };
    }

    const userAccessToken =
      extractBearer(req.headers["x-driver-authorization"]) ??
      req.headers["x-driver-access-token"] ??
      extractBearer(req.headers["x-user-authorization"]) ??
      req.headers["x-user-access-token"] ??
      null;
    const userId =
      userAccessToken && this.config.driverAuth
        ? await this.config.driverAuth.getUserIdFromAccessToken(userAccessToken)
        : null;
    const driverId = userId ? await this.config.repo.getDriverIdForUser(userId) : null;

    const ctx: ApiContext = {
      config: this.config,
      repo: this.config.repo,
      tenantId: client.tenantId,
      apiClientId: client.id,
      requestId,
      ip: req.ip ?? null,
      userId,
      driverUserId: userId,
      driverId,
      idempotencyKey: req.headers["idempotency-key"] ?? req.headers["x-idempotency-key"] ?? null,
    };

    let result: RouteResult;
    try {
      result = await matched.handler(ctx, {
        params: matched.params,
        body: req.body,
        query: url.searchParams,
      });
    } catch (error) {
      result = toErrorResult(error, requestId);
    }

    await this.config.repo
      .logApiRequest({
        tenant_id: client.tenantId,
        api_client_id: client.id,
        request_id: requestId,
        method: req.method,
        path: url.pathname,
        status_code: result.status,
      })
      .catch(() => undefined);

    return { ...result, headers: { ...baseHeaders, ...(result.headers ?? {}) } };
  }
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1]!.trim() : null;
}

function unauthorized(requestId: string): RouteResult {
  return {
    status: 401,
    body: { error: { code: "unauthorized", message: "Invalid or missing API key", request_id: requestId } },
    headers: { "x-request-id": requestId },
  };
}

function toErrorResult(error: unknown, requestId: string): RouteResult {
  if (error instanceof z.ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          request_id: requestId,
          details: error.issues,
        },
      },
    };
  }
  if (isAppError(error)) {
    return { status: error.status, body: error.toJSON(requestId) };
  }
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "Internal server error", request_id: requestId } },
  };
}

export { AppError };
