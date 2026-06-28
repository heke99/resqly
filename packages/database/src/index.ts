import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./generated-types";

export type { Database } from "./generated-types";
export type AppSupabaseClient = SupabaseClient<Database>;

/**
 * Service-role client. NEVER import this into client/browser bundles — it
 * bypasses RLS. Use only in server routes, edge functions and workers.
 */
export function createServiceClient(url: string, serviceRoleKey: string): AppSupabaseClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Anonymous client used with a user JWT so RLS is enforced. */
export function createAnonClient(
  url: string,
  anonKey: string,
  accessToken?: string,
): AppSupabaseClient {
  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

/**
 * Allocate a race-safe case number for a tenant via the Postgres function.
 * `scope` lets a tenant keep separate sequences per case type when desired.
 */
export async function allocateCaseNumber(
  client: AppSupabaseClient,
  tenantId: string,
  scope = "default",
): Promise<string> {
  const { data, error } = await client.rpc("allocate_case_number", {
    p_tenant: tenantId,
    p_scope: scope,
  });
  if (error) throw new Error(`allocate_case_number failed: ${error.message}`);
  return data as string;
}

export const MIGRATIONS_DIR = "supabase/migrations";
