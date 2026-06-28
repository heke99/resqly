import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@roadside/database";

/**
 * Browser Supabase client built from public env. Returns null when env is not
 * configured (e.g. during static build), so pages render empty states instead
 * of crashing — which is correct because the system ships with no data.
 */
export function createBrowserSupabase(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient<Database>(url, key);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
