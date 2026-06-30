import type { BankidEnv } from "@resqly/types";
import type { BankidProvider } from "./provider";
import { SimulatedBankidProvider } from "./simulated";
import { TicBankidProvider } from "./tic";

export interface BankidConfig {
  env: BankidEnv;
  mockEnabled: boolean;
  provider?: "mock" | "tic";
  tic?: {
    apiBaseUrl: string;
    apiKey: string;
    defaultProvider?: "bankid";
  };
}

/**
 * Select the BankID provider for the current environment.
 *  - mockEnabled/provider=mock -> local simulated provider only
 *  - provider=tic             -> production TIC adapter
 */
export function getBankidProvider(config: BankidConfig): BankidProvider {
  if (config.mockEnabled || config.provider === "mock" || config.env === "mock") {
    return new SimulatedBankidProvider({ environment: "mock", stepsToComplete: 1 });
  }
  if (config.provider === "tic") {
    if (!config.tic?.apiKey) throw new Error("TIC_API_KEY is required when BANKID_PROVIDER=tic");
    return new TicBankidProvider({
      apiBaseUrl: config.tic.apiBaseUrl,
      apiKey: config.tic.apiKey,
      defaultProvider: config.tic.defaultProvider ?? "bankid",
    });
  }
  if (config.env === "test") {
    return new SimulatedBankidProvider({ environment: "test", stepsToComplete: 2 });
  }
  throw new Error("BankID production adapter is not configured. Set BANKID_PROVIDER=tic and TIC_API_KEY.");
}
