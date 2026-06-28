import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash a Swedish personal number for storage. A server-side pepper (the
 * ENCRYPTION_KEY) ensures the hash is not reversible via a precomputed table.
 * The raw personal number must never be persisted.
 */
export function hashPersonalNumber(personalNumber: string, pepper: string): string {
  const normalized = personalNumber.replace(/\D/g, "");
  return createHmac("sha256", pepper).update(normalized).digest("hex");
}

/** Stable hash of a canonical signed payload (for BankID signature records). */
export function signedPayloadHash(payload: unknown): string {
  return sha256Hex(typeof payload === "string" ? payload : JSON.stringify(payload));
}

/** HMAC-SHA256 signature used for outgoing webhooks. */
export function hmacSignature(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/** Constant-time comparison to verify a webhook signature. */
export function verifyHmacSignature(secret: string, body: string, signature: string): boolean {
  const expected = hmacSignature(secret, body);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
