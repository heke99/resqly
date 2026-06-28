export type AppErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_error"
  | "tenant_mismatch"
  | "dependency_unavailable"
  | "internal_error";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  validation_error: 422,
  tenant_mismatch: 403,
  dependency_unavailable: 503,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  toJSON(requestId?: string) {
    return {
      error: {
        code: this.code,
        message: this.message,
        request_id: requestId,
        details: this.details,
      },
    };
  }
}

export const forbidden = (message = "Forbidden", details?: unknown) =>
  new AppError("forbidden", message, details);
export const notFound = (message = "Not found", details?: unknown) =>
  new AppError("not_found", message, details);
export const badRequest = (message = "Bad request", details?: unknown) =>
  new AppError("bad_request", message, details);
export const tenantMismatch = (message = "Cross-tenant access denied") =>
  new AppError("tenant_mismatch", message);

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
