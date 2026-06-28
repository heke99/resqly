import type { BankidEnv, BankidHintCode, BankidStatus } from "@roadside/types";

export interface BankidStartRequest {
  /** Purpose shown to the user / stored for audit, e.g. "Sign towing case". */
  purpose: string;
  endUserIp?: string;
  /** Optional personal number for "same device"-less flows (test/mock only). */
  personalNumber?: string;
}

export interface BankidStartResult {
  orderRef: string;
  autoStartToken: string;
}

export interface BankidCompletionData {
  personalNumber: string;
  name: string;
  signature: string;
}

export interface BankidCollectResult {
  orderRef: string;
  status: BankidStatus;
  hintCode?: BankidHintCode;
  completionData?: BankidCompletionData;
}

/**
 * Provider abstraction. The production adapter (real BankID RP API over mTLS)
 * implements the same interface; only test/mock adapters ship in this phase.
 */
export interface BankidProvider {
  readonly environment: BankidEnv;
  start(req: BankidStartRequest): Promise<BankidStartResult>;
  collect(orderRef: string): Promise<BankidCollectResult>;
  cancel(orderRef: string): Promise<void>;
}
