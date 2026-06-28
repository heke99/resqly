import { randomBytes } from "node:crypto";
import type { BankidEnv, BankidStatus } from "@roadside/types";
import type {
  BankidCollectResult,
  BankidProvider,
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
 * Deterministic in-memory BankID provider used for both the local "mock" and
 * the BankID "test" environments. It makes NO network calls and never touches a
 * real person; it simply advances an order through the standard status flow.
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
    const ref = `${this.environment}-${randomBytes(8).toString("hex")}`;
    const personalNumber = (req.personalNumber ?? "190001019999").replace(/\D/g, "");
    this.orders.set(ref, {
      ref,
      step: 0,
      cancelled: false,
      personalNumber,
      name: this.displayName(personalNumber),
      outcome: "complete",
    });
    return { orderRef: ref, autoStartToken: randomBytes(16).toString("hex") };
  }

  async collect(orderRef: string): Promise<BankidCollectResult> {
    const order = this.orders.get(orderRef);
    if (!order) {
      return { orderRef, status: "failed", hintCode: "startFailed" };
    }
    if (order.cancelled) {
      return { orderRef, status: "cancelled", hintCode: "userCancel" };
    }

    order.step += 1;
    const reached = Math.min(order.step, this.steps);
    const ratio = reached / this.steps;
    const idx = Math.min(STATUS_FLOW.length - 1, Math.floor(ratio * (STATUS_FLOW.length - 1)));
    const status = order.step >= this.steps ? "complete" : STATUS_FLOW[idx]!;

    if (status === "complete") {
      return {
        orderRef,
        status,
        completionData: {
          personalNumber: order.personalNumber,
          name: order.name,
          signature: randomBytes(32).toString("base64"),
        },
      };
    }
    const hintCode = status === "user_sign" ? "userSign" : status === "started" ? "started" : "outstandingTransaction";
    return { orderRef, status, hintCode };
  }

  async cancel(orderRef: string): Promise<void> {
    const order = this.orders.get(orderRef);
    if (order) order.cancelled = true;
  }
}
