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

/**
 * Driver lifecycle actions go through the backend (which enforces the
 * accept-before-share rule and never exposes the personal number). This posts to
 * the partner/driver API base URL.
 */
export async function apiPost(path: string, body: unknown): Promise<Response | null> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  const token = process.env.EXPO_PUBLIC_DRIVER_TOKEN;
  if (!base) return null;
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
