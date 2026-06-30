import { randomBytes } from "node:crypto";
import type { BankidEnv, BankidStatus } from "@resqly/types";
import type {
  BankidCollectResult,
  BankidProvider,
  BankidSignRequest,
  BankidStartRequest,
  BankidStartResult,
} from "./provider";

interface Order {
  ref: string;
  step: number;
  cancelled: boolean;
  personalNumber: string;
  name: string;
  outcome: "complete" | "cancel" | "expire";
}

const STATUS_FLOW: BankidStatus[] = ["pending", "started", "user_sign", "complete"];

export interface SimulatedProviderOptions {
  environment: BankidEnv;
  /** Number of collect() calls before reaching "complete". */
  stepsToComplete?: number;
  /** Deterministic display name generator for tests. */
  displayName?: (personalNumber: string) => string;
}

/**
 * Deterministic in-memory BankID provider used for local mock/test. It makes NO
 * network calls and never touches a real person; it simply advances an order
 * through the standard status flow.
 */
export class SimulatedBankidProvider implements BankidProvider {
  readonly environment: BankidEnv;
  private readonly steps: number;
  private readonly displayName: (pn: string) => string;
  private readonly orders = new Map<string, Order>();

  constructor(opts: SimulatedProviderOptions) {
    this.environment = opts.environment;
    this.steps = Math.max(1, opts.stepsToComplete ?? 1);
    this.displayName = opts.displayName ?? ((pn) => `Test User ${pn.slice(-4)}`);
  }

  async start(req: BankidStartRequest): Promise<BankidStartResult> {
    return this.createOrder(req.personalNumber);
  }

  async sign(req: BankidSignRequest): Promise<BankidStartResult> {
    return this.createOrder(req.personalNumber);
  }

  async poll(sessionId: string): Promise<BankidCollectResult> {
    return this.collect(sessionId);
  }

  async collect(sessionId: string): Promise<BankidCollectResult> {
    const order = this.orders.get(sessionId);
    if (!order) {
      return { sessionId, orderRef: sessionId, status: "failed", hintCode: "startFailed" };
    }
    if (order.cancelled) {
      return { sessionId, orderRef: sessionId, status: "cancelled", hintCode: "userCancel" };
    }

    order.step += 1;
    const reached = Math.min(order.step, this.steps);
    const ratio = reached / this.steps;
    const idx = Math.min(STATUS_FLOW.length - 1, Math.floor(ratio * (STATUS_FLOW.length - 1)));
    const status = order.step >= this.steps ? "complete" : STATUS_FLOW[idx]!;

    if (status === "complete") {
      return {
        sessionId,
        orderRef: sessionId,
        status,
        completedAt: new Date().toISOString(),
        completionData: {
          personalNumber: order.personalNumber,
          name: order.name,
          signature: randomBytes(32).toString("base64"),
        },
      };
    }
    const hintCode = status === "user_sign" ? "userSign" : status === "started" ? "started" : "outstandingTransaction";
    return { sessionId, orderRef: sessionId, status, hintCode };
  }

  async cancel(sessionId: string): Promise<void> {
    const order = this.orders.get(sessionId);
    if (order) order.cancelled = true;
  }

  private async createOrder(personalNumberInput?: string): Promise<BankidStartResult> {
    const ref = `${this.environment}-${randomBytes(8).toString("hex")}`;
    const personalNumber = (personalNumberInput ?? "190001019999").replace(/\D/g, "");
    this.orders.set(ref, {
      ref,
      step: 0,
      cancelled: false,
      personalNumber,
      name: this.displayName(personalNumber),
      outcome: "complete",
    });
    return { sessionId: ref, orderRef: ref, autoStartToken: randomBytes(16).toString("hex"), provider: "mock" };
  }
}
