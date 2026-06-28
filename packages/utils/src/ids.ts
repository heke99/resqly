import { randomUUID, randomBytes } from "node:crypto";

export const newId = (): string => randomUUID();

/** Generates a URL-safe idempotency key for client requests. */
export const newIdempotencyKey = (): string => randomBytes(16).toString("hex");

/** Request id used to correlate logs across services. */
export const newRequestId = (): string => `req_${randomBytes(12).toString("hex")}`;

/** Opaque API key: prefix lets us identify environment at a glance. */
export function newApiKey(prefix = "rk_live"): { key: string; last4: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${prefix}_${secret}`;
  return { key, last4: secret.slice(-4) };
}
