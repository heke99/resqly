import { createServiceClient, type AppSupabaseClient } from "@resqly/database";

/**
 * Server-only Supabase service client for Next.js server components / route
 * handlers. Returns null when env is missing so server components can render
 * empty states during build. NEVER import this into a client component.
 */
export function getServiceClient(): AppSupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}
