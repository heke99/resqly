import type { BankidEnv } from "@roadside/types";
import type { BankidProvider } from "./provider";
import { SimulatedBankidProvider } from "./simulated";

export interface BankidConfig {
  env: BankidEnv;
  mockEnabled: boolean;
}

/**
 * Select the BankID provider for the current environment.
 *  - mockEnabled or env=mock  -> in-memory mock (no network, instant complete)
 *  - env=test                 -> simulated BankID test environment
 *  - env=production           -> NOT IMPLEMENTED YET (requires mTLS cert)
 */
export function getBankidProvider(config: BankidConfig): BankidProvider {
  if (config.mockEnabled || config.env === "mock") {
    return new SimulatedBankidProvider({ environment: "mock", stepsToComplete: 1 });
  }
  if (config.env === "test") {
    return new SimulatedBankidProvider({ environment: "test", stepsToComplete: 2 });
  }
  throw new Error(
    "BankID production adapter is not configured. Provide a production certificate " +
      "and implement the RP API adapter before setting BANKID_ENV=production.",
  );
}
