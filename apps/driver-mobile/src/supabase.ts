import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
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

export interface DriverApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  /** Friendly Swedish message from the server (error.user_message) or null. */
  error: string | null;
}

const GENERIC_ERROR = "Något gick fel. Kontrollera din uppkoppling och försök igen.";

/**
 * Driver lifecycle actions go through the backend (which enforces the
 * accept-before-share rule and never exposes the personal number). Auth is
 * the driver's own session token — the app never ships an API key.
 */
export async function apiPost<T = Record<string, unknown>>(path: string, body: unknown): Promise<DriverApiResult<T>> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  const headers = await authHeaders();
  if (!base) return { ok: false, status: 0, data: {} as T, error: "Appen är inte klar att användas ännu." };
  if (!headers) return { ok: false, status: 401, data: {} as T, error: "Du behöver logga in igen." };
  try {
    const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { user_message?: string; message?: string } };
    return {
      ok: res.ok,
      status: res.status,
      data: json,
      error: res.ok ? null : json.error?.user_message ?? GENERIC_ERROR,
    };
  } catch {
    return { ok: false, status: 0, data: {} as T, error: GENERIC_ERROR };
  }
}

/** Authenticated GET against the driver API. Returns parsed JSON or null. */
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


export async function uploadSignedEvidence(params: {
  path: string;
  token: string;
  uri: string;
  contentType: string;
}): Promise<{ ok: boolean; sizeBytes: number; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, sizeBytes: 0, error: "Appen saknar lagringsanslutning." };
  try {
    const local = await fetch(params.uri);
    if (!local.ok) return { ok: false, sizeBytes: 0, error: "Bilden kunde inte läsas från telefonen." };
    const bytes = await local.arrayBuffer();
    if (bytes.byteLength <= 0 || bytes.byteLength > 10 * 1024 * 1024) {
      return { ok: false, sizeBytes: bytes.byteLength, error: "Bilden måste vara mindre än 10 MB." };
    }
    const { error } = await supabase.storage
      .from("tow-evidence")
      .uploadToSignedUrl(params.path, params.token, bytes, { contentType: params.contentType });
    return {
      ok: !error,
      sizeBytes: bytes.byteLength,
      error: error ? "Bilden kunde inte skickas. Försök igen." : null,
    };
  } catch {
    return { ok: false, sizeBytes: 0, error: "Bilden kunde inte skickas. Kontrollera uppkopplingen." };
  }
}
