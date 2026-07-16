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
  rawBody?: string;
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
    r.get("/health", (ctx) => this.health(ctx));
    r.get("/api/v1/health", (ctx) => this.health(ctx));
    r.post("/api/v1/incidents", (ctx, a) => incidents.createIncident(ctx, a.body));
    r.get("/api/v1/incidents/:id", (ctx, a) => incidents.getIncident(ctx, a.params.id!));
    r.post("/api/v1/incidents/:id/evidence", (ctx, a) =>
      incidents.addEvidence(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/incidents/:id/bankid/start", (ctx, a) =>
      incidents.startIncidentBankid(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/incidents/:id/bankid/sign", (ctx, a) =>
      incidents.signIncident(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/bankid/sessions/:sessionId/poll", (ctx, a) =>
      incidents.pollBankidSession(ctx, a.params.sessionId!),
    );
    r.get("/api/v1/bankid/sessions/:sessionId/collect", (ctx, a) =>
      incidents.collectBankidSession(ctx, a.params.sessionId!),
    );
    r.delete("/api/v1/bankid/sessions/:sessionId", (ctx, a) =>
      incidents.cancelBankidSession(ctx, a.params.sessionId!),
    );
    r.post("/api/v1/tic/webhook", (ctx, a) => incidents.ticWebhook(ctx, a.body));
    r.get("/api/v1/bankid/callback", (ctx, a) => incidents.bankidCallback(ctx, a.query));
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
    r.post("/api/v1/tow/jobs/:id/evidence/upload", (ctx, a) =>
      tow.createTowJobEvidenceUpload(ctx, a.params.id!, a.body),
    );
    r.post("/api/v1/tow/jobs/:id/evidence/complete", (ctx, a) =>
      tow.completeTowJobEvidenceUpload(ctx, a.params.id!, a.body),
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
    r.get("/api/v1/drivers/me/jobs", (ctx, a) => drivers.listJobs(ctx, a.query));
    r.post("/api/v1/drivers/offers/:id/accept", (ctx, a) => drivers.acceptOffer(ctx, a.params.id!));
    r.post("/api/v1/drivers/offers/:id/reject", (ctx, a) => drivers.rejectOffer(ctx, a.params.id!, a.body));

    // Manual / re-run dispatch for an existing tow job.
    r.post("/api/v1/dispatch/run", (ctx, a) => dispatch.runDispatch(ctx, a.body));
  }


  /**
   * Public health check. Deliberately minimal: it reports liveness and
   * overall configuration readiness but never enumerates which env vars,
   * providers or integrations are configured. The detailed per-organization
   * readiness lives in the internal operations portal (readiness views).
   */
  private health(ctx: ApiContext): RouteResult {
    const configured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
      Boolean(process.env.ENCRYPTION_KEY) &&
      (ctx.config.bankid.provider !== "tic" || Boolean(ctx.config.bankid.tic?.apiKey));
    return {
      status: configured ? 200 : 503,
      body: {
        ok: configured,
        service: "resqly-api",
        request_id: ctx.requestId,
      },
    };
  }

  async handle(req: RawRequest): Promise<RouteResult> {
    const requestId = newRequestId();
    const url = new URL(req.path, "http://internal");
    const matched = this.router.match(req.method, url.pathname);
    const baseHeaders = { "x-request-id": requestId };

    if (!matched) {
      return { status: 404, body: { error: { code: "not_found", message: "Route not found", request_id: requestId } }, headers: baseHeaders };
    }

    // Public health checks and provider callbacks are authenticated by their own
    // rules, not tenant API keys. Keep this narrow and explicit.
    if (
      url.pathname === "/health" ||
      url.pathname === "/api/v1/health" ||
      url.pathname === "/api/v1/tic/webhook" ||
      url.pathname === "/api/v1/bankid/callback"
    ) {
      const ctx: ApiContext = {
        config: this.config,
        repo: this.config.repo,
        tenantId: "public",
        apiClientId: "public",
        requestId,
        ip: req.ip ?? null,
        rawBody: req.rawBody,
        headers: req.headers,
      };
      try {
        const result = await matched.handler(ctx, {
          params: matched.params,
          body: req.body,
          query: url.searchParams,
          rawBody: req.rawBody,
        });
        return { ...result, headers: { ...baseHeaders, ...(result.headers ?? {}) } };
      } catch (error) {
        const result = toErrorResult(error, requestId);
        return { ...result, headers: { ...baseHeaders, ...(result.headers ?? {}) } };
      }
    }

    // Driver/mobile user-token routes do not require a tenant API key.
    // The mobile app must never ship a public tenant API secret; it sends the
    // Supabase user access token and the API resolves the driver/tenant server-side.
    const userTokenFromAuth =
      extractBearer(req.headers["authorization"]) ??
      extractBearer(req.headers["x-driver-authorization"]) ??
      req.headers["x-driver-access-token"] ??
      extractBearer(req.headers["x-user-authorization"]) ??
      req.headers["x-user-access-token"] ??
      null;
    // Tow job sub-routes (accept/reject/status/location/complete/eta and the
    // single-job read) are used by the driver mobile app with a Supabase user
    // token — the app never ships a tenant API key. The handlers enforce
    // driver-level authorization (assignment or a pending offer).
    const allowsUserToken =
      url.pathname === "/api/v1/me/role-context" ||
      url.pathname.startsWith("/api/v1/drivers/") ||
      /^\/api\/v1\/tow\/jobs\/[^/]+(\/(accept|reject|status|location|complete|eta|evidence)(\/(upload|complete))?)?$/.test(url.pathname);
    if (allowsUserToken && userTokenFromAuth && this.config.driverAuth) {
      const userId = await this.config.driverAuth.getUserIdFromAccessToken(userTokenFromAuth);
      if (userId) {
        // Rate limit the user-token lane per user (BankID, accept, status...).
        const rl = this.rateLimiter.check(`user:${userId}`);
        if (!rl.allowed) {
          return {
            status: 429,
            body: {
              error: {
                code: "rate_limited",
                message: "Rate limit exceeded",
                user_message: "För många försök. Vänta en stund och försök igen.",
                request_id: requestId,
              },
            },
            headers: baseHeaders,
          };
        }
        const driverId = await this.config.repo.getDriverIdForUser(userId);
        const driverProfile = driverId ? await this.config.repo.getDriverProfile(driverId) : null;
        const resolvedTenantId = driverProfile?.tenant_id ?? "public";
        const ctx: ApiContext = {
          config: this.config,
          repo: this.config.repo,
          tenantId: resolvedTenantId,
          apiClientId: "user-token",
          requestId,
          ip: req.ip ?? null,
          rawBody: req.rawBody,
          headers: req.headers,
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
            rawBody: req.rawBody,
          });
        } catch (error) {
          result = toErrorResult(error, requestId);
        }

        await this.config.repo
          .logApiRequest({
            tenant_id: resolvedTenantId === "public" ? null : resolvedTenantId,
            api_client_id: null,
            request_id: requestId,
            method: req.method,
            path: url.pathname,
            status_code: result.status,
          })
          .catch(() => undefined);

        return { ...result, headers: { ...baseHeaders, ...(result.headers ?? {}) } };
      }
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
      rawBody: req.rawBody,
      headers: req.headers,
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
        rawBody: req.rawBody,
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

/**
 * Friendly Swedish fallback messages per error code. Client apps show
 * `error.user_message` directly so end users never see technical wording.
 */
const USER_MESSAGES_SV: Record<string, string> = {
  bad_request: "Uppgifterna kunde inte behandlas. Kontrollera och försök igen.",
  unauthorized: "Du behöver logga in igen.",
  forbidden: "Du har inte behörighet att göra detta.",
  not_found: "Uppgiften kunde inte hittas.",
  conflict: "Åtgärden kunde inte genomföras. Försök igen.",
  rate_limited: "För många försök. Vänta en stund och försök igen.",
  validation_error: "Uppgifterna kunde inte behandlas. Kontrollera och försök igen.",
  tenant_mismatch: "Du har inte behörighet att göra detta.",
  dependency_unavailable: "Tjänsten kunde inte nås just nu. Försök igen om en stund.",
  internal_error: "Något gick fel. Försök igen eller kontakta support.",
};

function toErrorResult(error: unknown, requestId: string): RouteResult {
  if (error instanceof z.ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          user_message: USER_MESSAGES_SV.validation_error,
          request_id: requestId,
          details: error.issues,
        },
      },
    };
  }
  if (isAppError(error)) {
    const json = error.toJSON(requestId) as { error: Record<string, unknown> };
    const detailUserMessage =
      error.details && typeof error.details === "object"
        ? (error.details as { user_message?: string }).user_message
        : undefined;
    json.error.user_message = detailUserMessage ?? USER_MESSAGES_SV[error.code] ?? USER_MESSAGES_SV.internal_error;
    return { status: error.status, body: json };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "Internal server error",
        user_message: USER_MESSAGES_SV.internal_error,
        request_id: requestId,
      },
    },
  };
}

export { AppError };
