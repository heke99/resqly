import { backoffDelay } from "@resqly/utils";

export interface DeliveryState {
  id: string;
  attempts: number;
  status: "pending" | "delivering" | "succeeded" | "failed" | "exhausted";
}

export interface DeliveryOutcome {
  id: string;
  status: "succeeded" | "failed" | "exhausted";
  attempts: number;
  nextAttemptAt: string | null;
  error?: string;
}

export interface ProcessDeliveryOptions {
  maxAttempts?: number;
  now?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Attempt a single webhook delivery and compute the next retry. `send` performs
 * the signed HTTP POST and resolves to ok/false. On failure we schedule an
 * exponential-backoff retry until maxAttempts, then mark exhausted.
 */
export async function processDelivery(
  delivery: DeliveryState,
  send: () => Promise<{ ok: boolean; error?: string }>,
  options: ProcessDeliveryOptions = {},
): Promise<DeliveryOutcome> {
  const { maxAttempts = 6, now = Date.now(), baseDelayMs = 1000, maxDelayMs = 3_600_000 } = options;
  const attempts = delivery.attempts + 1;

  let result: { ok: boolean; error?: string };
  try {
    result = await send();
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (result.ok) {
    return { id: delivery.id, status: "succeeded", attempts, nextAttemptAt: null };
  }
  if (attempts >= maxAttempts) {
    return { id: delivery.id, status: "exhausted", attempts, nextAttemptAt: null, error: result.error };
  }
  const delay = Math.max(baseDelayMs, backoffDelay(attempts, baseDelayMs, maxDelayMs));
  return {
    id: delivery.id,
    status: "failed",
    attempts,
    nextAttemptAt: new Date(now + delay).toISOString(),
    error: result.error,
  };
}
