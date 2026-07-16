import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { buildWebhookEnvelope, signWebhook } from "@resqly/notifications";
import type { WebhookEvent } from "@resqly/types";
import type { AppSupabaseClient } from "@resqly/database";
import { validatePublicHttpsUrl } from "@resqly/utils";
import { processDelivery } from "./webhook-delivery";

export interface WebhookDeliveryRow {
  id: string;
  tenant_id: string;
  webhook_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: "pending" | "delivering" | "failed" | "succeeded" | "exhausted";
  attempts: number;
}

interface TenantWebhookRow {
  id: string;
  url: string;
  secret: string;
  active: boolean;
  events: string[];
}

export type FetchLike = (
  url: string,
  init?: unknown,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;
export type ResolveHost = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export async function pollWebhookDeliveries(
  db: AppSupabaseClient,
  opts: { fetchImpl?: FetchLike; resolveHost?: ResolveHost; now?: Date; limit?: number } = {},
): Promise<void> {
  const now = opts.now ?? new Date();
  const { data } = await db
    .from("webhook_deliveries" as never)
    .select("id, tenant_id, webhook_id, event, payload, status, attempts")
    .in("status", ["pending", "failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 50);

  const deliveries = ((data as WebhookDeliveryRow[] | null) ?? []) as WebhookDeliveryRow[];
  for (const delivery of deliveries) {
    await db
      .from("webhook_deliveries" as never)
      .update({ status: "delivering", updated_at: new Date().toISOString() } as never)
      .eq("id", delivery.id);

    const { data: webhook } = await db
      .from("tenant_webhooks" as never)
      .select("id, url, secret, active, events")
      .eq("id", delivery.webhook_id)
      .maybeSingle();
    const target = webhook as TenantWebhookRow | null;
    const outcome = await processDelivery(
      delivery,
      () => deliverOnce(
        delivery,
        target,
        opts.fetchImpl,
        opts.resolveHost ?? defaultResolveHost,
      ),
      { now: now.getTime() },
    );

    await db
      .from("webhook_deliveries" as never)
      .update({
        status: outcome.status,
        attempts: outcome.attempts,
        next_attempt_at: outcome.nextAttemptAt,
        last_error: outcome.error ?? null,
        response_status: outcome.responseStatus ?? null,
        response_body: outcome.responseBody ?? null,
        updated_at: new Date().toISOString(),
        delivered_at: outcome.status === "succeeded" ? new Date().toISOString() : null,
      } as never)
      .eq("id", delivery.id);
  }
}

async function deliverOnce(
  delivery: WebhookDeliveryRow,
  target: TenantWebhookRow | null,
  fetchImpl: FetchLike | undefined,
  resolveHost: ResolveHost,
): Promise<{ ok: boolean; error?: string; responseStatus?: number | null; responseBody?: string | null }> {
  if (!target || !target.active) {
    return { ok: false, error: "webhook target inactive or missing", responseStatus: null, responseBody: null };
  }
  if (!target.events.includes(delivery.event)) {
    return { ok: false, error: "webhook target no longer subscribes to event", responseStatus: null, responseBody: null };
  }

  // Validate on every attempt, not only at onboarding. This prevents an
  // already-saved hostname from later resolving to localhost/cloud metadata.
  const safeTarget = await resolvePublicWebhookTarget(target.url, resolveHost);
  const safeUrl = safeTarget.url;
  const envelope = buildWebhookEnvelope(
    delivery.event as WebhookEvent,
    delivery.tenant_id,
    delivery.payload,
  );
  const signed = signWebhook(target.secret, envelope);
  const res = fetchImpl
    ? await fetchImpl(safeUrl.toString(), {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
        redirect: "manual",
      })
    : await postPinnedHttps(safeTarget, signed.headers, signed.body);
  const responseBody = await res.text().catch(() => "");
  if (!res.ok) {
    return {
      ok: false,
      error: `HTTP ${res.status}${responseBody ? ` ${responseBody.slice(0, 500)}` : ""}`,
      responseStatus: res.status,
      responseBody: responseBody.slice(0, 4000),
    };
  }
  return { ok: true, responseStatus: res.status, responseBody: responseBody.slice(0, 4000) };
}

interface ResolvedWebhookTarget {
  url: URL;
  address: string;
  family: number;
}

async function resolvePublicWebhookTarget(
  value: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<ResolvedWebhookTarget> {
  const url = validatePublicHttpsUrl(value);
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname, family: isIP(url.hostname) }]
    : await resolveHost(url.hostname);
  if (addresses.length === 0) throw new Error("webhook hostname did not resolve");
  for (const { address } of addresses) {
    if (isPrivateIpAddress(address)) {
      throw new Error(`webhook target resolves to a private or reserved address: ${address}`);
    }
  }
  const selected = addresses[0]!;
  return { url, address: selected.address, family: selected.family };
}

export async function assertPublicWebhookTarget(
  value: string,
  resolveHost: ResolveHost = defaultResolveHost,
): Promise<URL> {
  return (await resolvePublicWebhookTarget(value, resolveHost)).url;
}

/** True for loopback, private, link-local, carrier NAT, multicast and other
 * non-public targets that must never be reachable by tenant webhooks. */
export function isPrivateIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpAddress(normalized.slice("::ffff:".length));
  }
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return a === 0
      || a === 10
      || a === 127
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::"
      || normalized === "::1"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe8")
      || normalized.startsWith("fe9")
      || normalized.startsWith("fea")
      || normalized.startsWith("feb")
      || normalized.startsWith("ff");
  }
  return true;
}

const defaultResolveHost: ResolveHost = async (hostname) => {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family }));
};

function postPinnedHttps(
  target: ResolvedWebhookTarget,
  headers: Record<string, string>,
  body: string,
): Promise<{ ok: boolean; status: number; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const request = httpsRequest({
      protocol: "https:",
      hostname: target.address,
      family: target.family === 6 ? 6 : 4,
      port: target.url.port ? Number(target.url.port) : 443,
      path: `${target.url.pathname}${target.url.search}`,
      method: "POST",
      servername: target.url.hostname,
      headers: {
        ...headers,
        host: target.url.host,
        "content-length": Buffer.byteLength(body).toString(),
      },
      timeout: 10_000,
      rejectUnauthorized: true,
    }, (response) => {
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > 64 * 1024) {
          request.destroy(new Error("webhook response exceeded 64 KiB"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        const status = response.statusCode ?? 0;
        const responseText = Buffer.concat(chunks).toString("utf8");
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => responseText,
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("webhook request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}
