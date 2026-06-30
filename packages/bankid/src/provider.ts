import type { BankidEnv, BankidHintCode, BankidStatus } from "@resqly/types";

export interface BankidStartRequest {
  /** Purpose shown to the user / stored for audit, e.g. "Sign towing case". */
  purpose: string;
  endUserIp?: string;
  /** Forwarded browser User-Agent. Required/recommended by BankID risk checks. */
  userAgent?: string;
  /** Optional personal number to restrict the BankID session to a specific person. */
  personalNumber?: string;
  callbackUrl?: string;
  webhookUrl?: string;
  state?: string;
}

export interface BankidSignRequest extends BankidStartRequest {
  userVisibleData: string;
  userVisibleDataFormat?: "simpleMarkdownV1" | "text";
  userNonVisibleData?: string;
}

export interface BankidStartResult {
  /** TIC session id or BankID orderRef in mock/test. */
  sessionId: string;
  orderRef: string;
  autoStartToken: string;
  qrStartToken?: string;
  qrStartSecret?: string;
  subscriptionToken?: string;
  sessionExpiresAt?: string;
  provider?: string;
}

export interface BankidCompletionData {
  personalNumber: string;
  name: string;
  givenName?: string;
  surname?: string;
  /** BankID/TIC signature value for sign flows. Auth-only flows may return an empty string. */
  signature: string;
  ocspResponse?: string;
  raw?: unknown;
}

export interface BankidCollectResult {
  sessionId: string;
  orderRef: string;
  status: BankidStatus;
  hintCode?: BankidHintCode;
  message?: string;
  completedAt?: string;
  completionData?: BankidCompletionData;
  raw?: unknown;
}

/** Provider abstraction. TIC is the production adapter; mock/test stays local only. */
export interface BankidProvider {
  readonly environment: BankidEnv;
  start(req: BankidStartRequest): Promise<BankidStartResult>;
  sign(req: BankidSignRequest): Promise<BankidStartResult>;
  /** Active polling endpoint. Use every ~2s for real BankID/TIC flows. */
  poll(sessionId: string): Promise<BankidCollectResult>;
  /** Cached/final result endpoint. Do not use as active polling for TIC. */
  collect(sessionId: string): Promise<BankidCollectResult>;
  cancel(sessionId: string): Promise<void>;
}
