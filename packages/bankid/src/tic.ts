import { verifyHmacSignature } from "@resqly/utils";
import type { BankidHintCode, BankidStatus } from "@resqly/types";
import type {
  BankidCollectResult,
  BankidProvider,
  BankidSignRequest,
  BankidStartRequest,
  BankidStartResult,
} from "./provider";

export type FetchLike = (url: string, init?: unknown) => Promise<{
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export interface TicBankidProviderOptions {
  apiBaseUrl: string;
  apiKey: string;
  defaultProvider?: "bankid";
  fetchImpl?: FetchLike;
}

interface TicStartResponse {
  sessionId: string;
  provider?: string;
  orderRef?: string;
  autoStartToken?: string;
  qrStartToken?: string;
  qrStartSecret?: string;
  subscriptionToken?: string;
  sessionExpiresAt?: string;
}

interface TicCollectResponse {
  sessionId?: string;
  orderRef?: string;
  status?: string;
  hintCode?: string;
  message?: string;
  completedAt?: string;
  user?: {
    personalNumber?: string;
    givenName?: string;
    surname?: string;
    name?: string;
  };
  completionData?: {
    user?: TicCollectResponse["user"];
    signature?: string;
    ocspResponse?: string;
  };
  signature?: string;
  ocspResponse?: string;
}

export class TicBankidProvider implements BankidProvider {
  readonly environment = "production" as const;
  private readonly baseUrl: string;
  private readonly provider: "bankid";
  private readonly fetchImpl: FetchLike;

  constructor(private readonly opts: TicBankidProviderOptions) {
    if (!opts.apiKey) throw new Error("TIC_API_KEY is required for production BankID");
    this.baseUrl = opts.apiBaseUrl.replace(/\/+$/, "");
    this.provider = opts.defaultProvider ?? "bankid";
    this.fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  }

  async start(req: BankidStartRequest): Promise<BankidStartResult> {
    const data = await this.request<TicStartResponse>(`/auth/${this.provider}/start`, "POST", buildStartBody(req));
    return toStartResult(data);
  }

  async sign(req: BankidSignRequest): Promise<BankidStartResult> {
    const data = await this.request<TicStartResponse>(`/auth/${this.provider}/sign`, "POST", {
      ...buildStartBody(req),
      userVisibleData: req.userVisibleData,
      userVisibleDataFormat: req.userVisibleDataFormat ?? "simpleMarkdownV1",
      userNonVisibleData: req.userNonVisibleData,
    });
    return toStartResult(data);
  }

  async poll(sessionId: string): Promise<BankidCollectResult> {
    const data = await this.request<TicCollectResponse>(`/auth/${encodeURIComponent(sessionId)}/poll`, "POST");
    return toCollectResult(sessionId, data);
  }

  async collect(sessionId: string): Promise<BankidCollectResult> {
    const data = await this.request<TicCollectResponse>(`/auth/${encodeURIComponent(sessionId)}/collect`, "GET");
    return toCollectResult(sessionId, data);
  }

  async cancel(sessionId: string): Promise<void> {
    await this.request<unknown>(`/auth/${encodeURIComponent(sessionId)}`, "DELETE");
  }

  private async request<T>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "X-Api-Key": this.opts.apiKey,
        "Content-Type": "application/json",
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = "";
      try {
        detail = res.text ? await res.text() : JSON.stringify(await res.json());
      } catch {
        detail = "";
      }
      throw new Error(`TIC BankID ${method} ${path} failed with ${res.status}${detail ? `: ${detail}` : ""}`);
    }
    if (method === "DELETE") return undefined as T;
    return (await res.json()) as T;
  }
}

export function verifyTicWebhookSignature(secret: string, rawBody: string, signature: string | undefined): boolean {
  if (!secret || !signature) return false;
  return verifyHmacSignature(secret, rawBody, signature);
}

function buildStartBody(req: BankidStartRequest): Record<string, unknown> {
  return stripUndefined({
    endUserIp: req.endUserIp,
    userAgent: req.userAgent,
    personalNumber: req.personalNumber,
    callbackUrl: req.callbackUrl,
    webhookUrl: req.webhookUrl,
    state: req.state,
  });
}

function toStartResult(data: TicStartResponse): BankidStartResult {
  return {
    sessionId: data.sessionId,
    orderRef: data.orderRef ?? data.sessionId,
    autoStartToken: data.autoStartToken ?? "",
    qrStartToken: data.qrStartToken,
    qrStartSecret: data.qrStartSecret,
    subscriptionToken: data.subscriptionToken,
    sessionExpiresAt: data.sessionExpiresAt,
    provider: data.provider ?? "bankid",
  };
}

function toCollectResult(sessionId: string, data: TicCollectResponse): BankidCollectResult {
  const user = data.user ?? data.completionData?.user;
  const status = mapStatus(data.status);
  const signature = data.signature ?? data.completionData?.signature ?? "";
  const ocspResponse = data.ocspResponse ?? data.completionData?.ocspResponse;
  const completionData = status === "complete" && user?.personalNumber
    ? {
        personalNumber: user.personalNumber,
        name: (user.name ?? [user.givenName, user.surname].filter(Boolean).join(" ")) || "BankID User",
        givenName: user.givenName,
        surname: user.surname,
        signature,
        ocspResponse,
        raw: data,
      }
    : undefined;
  return {
    sessionId: data.sessionId ?? sessionId,
    orderRef: data.orderRef ?? data.sessionId ?? sessionId,
    status,
    hintCode: mapHintCode(data.hintCode),
    message: data.message,
    completedAt: data.completedAt,
    completionData,
    raw: data,
  };
}

function mapStatus(status: string | undefined): BankidStatus {
  switch (status) {
    case "complete":
    case "completed":
      return "complete";
    case "failed":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "expired":
      return "expired";
    case "user_sign":
    case "userSign":
      return "user_sign";
    case "started":
      return "started";
    default:
      return "pending";
  }
}

function mapHintCode(hint: string | undefined): BankidHintCode | undefined {
  const allowed = new Set<BankidHintCode>([
    "outstandingTransaction",
    "noClient",
    "started",
    "userSign",
    "userCancel",
    "expiredTransaction",
    "certificateErr",
    "startFailed",
    "internalError",
  ]);
  return hint && allowed.has(hint as BankidHintCode) ? (hint as BankidHintCode) : undefined;
}

function stripUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== ""));
}
