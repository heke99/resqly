export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  /** Return false to stop retrying for a given error. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Compute an exponential backoff delay with full jitter. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, factor = 2) {
  const exp = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt));
  return Math.floor(Math.random() * exp);
}

export async function retry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 4,
    baseDelayMs = 200,
    maxDelayMs = 10_000,
    factor = 2,
    shouldRetry = () => true,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error, attempt)) break;
      const delay = backoffDelay(attempt, baseDelayMs, maxDelayMs, factor);
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
