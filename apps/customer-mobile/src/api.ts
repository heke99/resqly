import { getSupabase } from "./supabase";

/**
 * All customer writes go through the same server API as the customer web app
 * (validation, BankID, dispatch and audit live server-side — the app never
 * writes cases or policies directly to the database).
 */
export function customerApiBase(): string | null {
  const base =
    process.env.EXPO_PUBLIC_CUSTOMER_API_URL ??
    process.env.EXPO_PUBLIC_CUSTOMER_WEB_URL ??
    null;
  return base ? base.replace(/\/+$/, "") : null;
}

async function accessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface ApiResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T;
  error: string | null;
}

const GENERIC_ERROR = "Något gick fel. Kontrollera din uppkoppling och försök igen.";

export async function customerApi<T = Record<string, unknown>>(
  path: string,
  options: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<ApiResult<T>> {
  const base = customerApiBase();
  if (!base) return { ok: false, status: 0, data: {} as T, error: "Appen är inte klar att användas ännu. Försök igen senare." };
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, data: {} as T, error: "Du behöver logga in igen." };
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    };
    if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
    const res = await fetch(`${base}${path}`, {
      method: options.method ?? "POST",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    return {
      ok: res.ok,
      status: res.status,
      data: json,
      error: res.ok ? null : typeof json.error === "string" ? json.error : GENERIC_ERROR,
    };
  } catch {
    return { ok: false, status: 0, data: {} as T, error: GENERIC_ERROR };
  }
}

/** Poll a BankID session until complete/failed (max ~90 seconds). */
export async function pollBankidSession(sessionId: string): Promise<{ ok: boolean; message: string }> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 2000));
    const res = await customerApi<{ status?: string; bankid_verified?: boolean }>(
      `/api/customer/bankid/sessions/${sessionId}/poll`,
    );
    if (!res.ok) return { ok: false, message: res.error ?? "BankID kunde inte kontrolleras. Försök igen." };
    if (res.data.bankid_verified || res.data.status === "complete") {
      return { ok: true, message: "BankID-verifieringen är klar." };
    }
    if (["failed", "cancelled", "expired"].includes(String(res.data.status))) {
      return { ok: false, message: "BankID-verifieringen avbröts eller gick ut. Försök igen." };
    }
  }
  return { ok: false, message: "BankID tar längre tid än väntat. Kontrollera status igen om en stund." };
}

export function newIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
