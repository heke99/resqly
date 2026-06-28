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
  const apiToken = process.env.EXPO_PUBLIC_DRIVER_TOKEN;
  if (!base || !apiToken) return null;

  const supabase = getSupabase();
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const driverAccessToken = data.session?.access_token;

  return fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken}`,
      ...(driverAccessToken ? { "x-driver-authorization": `Bearer ${driverAccessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}
