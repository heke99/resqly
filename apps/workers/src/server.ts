import { optionalEnv } from "@resqly/utils";

/**
 * Worker runner. In production this polls the database for due webhook
 * deliveries, expired offers and ETA refreshes and processes them on an
 * interval. The job logic itself lives in ./jobs and is unit-tested in
 * isolation. Wiring to Supabase + the partner API is done here.
 */
const intervalMs = Number(optionalEnv("WORKER_INTERVAL_MS", "15000")) || 15000;

async function tick(): Promise<void> {
  // Placeholder loop. Real implementation:
  //   1. fetch webhook_deliveries where status in (pending,failed) and due
  //   2. fetch tow_job_offers where status=pending and expired
  //   3. fetch active tow_jobs needing ETA refresh
  //   4. process each using the pure job functions, write results back
  // Kept as a no-op so the worker process starts cleanly without a database.
}

async function main(): Promise<void> {
  console.log(`[workers] starting, interval=${intervalMs}ms`);
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

void main();
