import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: true } });
  return client;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const driverAccessToken = data.session?.access_token;
  if (!driverAccessToken) return null;
  return {
    "content-type": "application/json",
    authorization: `Bearer ${driverAccessToken}`,
  };
}

/**
 * Driver lifecycle actions go through the backend (which enforces the
 * accept-before-share rule and never exposes the personal number). This posts to
 * the partner/driver API base URL.
 */
export async function apiPost(path: string, body: unknown): Promise<Response | null> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  const headers = await authHeaders();
  if (!base || !headers) return null;
  return fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

/** Authenticated GET against the driver/partner API. Returns parsed JSON or null. */
export async function apiGet<T>(path: string): Promise<T | null> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  const headers = await authHeaders();
  if (!base || !headers) return null;
  try {
    const res = await fetch(`${base}${path}`, { method: "GET", headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
