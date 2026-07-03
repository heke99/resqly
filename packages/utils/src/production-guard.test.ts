import { describe, expect, it } from "vitest";
import {
  assertDemoAllowed,
  assertNoMockBankidInProduction,
  evaluateProductionReadiness,
  isMockBankidConfigured,
  isProductionEnv,
} from "./production-guard";

describe("isProductionEnv", () => {
  it("APP_ENV wins over NODE_ENV", () => {
    expect(isProductionEnv({ APP_ENV: "production", NODE_ENV: "development" })).toBe(true);
    expect(isProductionEnv({ APP_ENV: "staging", NODE_ENV: "production" })).toBe(false);
  });
  it("falls back to NODE_ENV and defaults to development", () => {
    expect(isProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionEnv({})).toBe(false);
  });
});

describe("mock BankID production guard", () => {
  it("detects every mock/test BankID configuration", () => {
    expect(isMockBankidConfigured({ BANKID_MOCK_ENABLED: "true" })).toBe(true);
    expect(isMockBankidConfigured({ BANKID_PROVIDER: "mock" })).toBe(true);
    expect(isMockBankidConfigured({ BANKID_ENV: "mock" })).toBe(true);
    expect(isMockBankidConfigured({ BANKID_ENV: "test" })).toBe(true);
    expect(isMockBankidConfigured({ BANKID_PROVIDER: "tic", BANKID_ENV: "production" })).toBe(false);
  });

  it("throws when mock BankID is configured in production", () => {
    expect(() =>
      assertNoMockBankidInProduction({ APP_ENV: "production", BANKID_MOCK_ENABLED: "true" }),
    ).toThrow(/not allowed in production/);
    expect(() =>
      assertNoMockBankidInProduction({ NODE_ENV: "production", BANKID_PROVIDER: "mock" }),
    ).toThrow(/not allowed in production/);
    expect(() =>
      assertNoMockBankidInProduction({ APP_ENV: "production", BANKID_ENV: "test" }),
    ).toThrow(/not allowed in production/);
  });

  it("allows real TIC configuration in production and mock outside production", () => {
    expect(() =>
      assertNoMockBankidInProduction({
        APP_ENV: "production",
        BANKID_PROVIDER: "tic",
        BANKID_ENV: "production",
        BANKID_MOCK_ENABLED: "false",
      }),
    ).not.toThrow();
    expect(() =>
      assertNoMockBankidInProduction({ APP_ENV: "staging", BANKID_MOCK_ENABLED: "true" }),
    ).not.toThrow();
  });
});

describe("demo guard", () => {
  it("blocks demo data creation in production", () => {
    expect(() => assertDemoAllowed({ APP_ENV: "production" })).toThrow(/blocked in production/);
    expect(() => assertDemoAllowed({ NODE_ENV: "production" })).toThrow(/blocked in production/);
  });
  it("allows demo data outside production", () => {
    expect(() => assertDemoAllowed({ APP_ENV: "staging" })).not.toThrow();
    expect(() => assertDemoAllowed({})).not.toThrow();
  });
});

describe("evaluateProductionReadiness", () => {
  const fullConfig = {
    supabaseUrl: "https://x.supabase.co",
    supabaseServiceRoleKey: "svc",
    encryptionKey: "a".repeat(32),
    bankidProvider: "tic",
    ticApiKey: "tic-key",
    googleMapsServerKey: "maps",
    resendApiKey: "resend",
    emailFrom: "Resqly <no-reply@resqly.se>",
    expoPushEnabled: true,
    smsEnabled: true,
    smsApiKey: "sms",
  };

  it("is ready when all required integrations are configured", () => {
    const result = evaluateProductionReadiness(fullConfig);
    expect(result.ready).toBe(true);
    expect(result.items.every((i) => i.ready)).toBe(true);
  });

  it("is not ready when BankID is missing and reports Swedish labels", () => {
    const result = evaluateProductionReadiness({ ...fullConfig, ticApiKey: undefined });
    expect(result.ready).toBe(false);
    const bankid = result.items.find((i) => i.key === "bankid");
    expect(bankid?.ready).toBe(false);
    expect(bankid?.label).toBe("BankID-verifiering");
  });

  it("treats SMS as optional", () => {
    const result = evaluateProductionReadiness({ ...fullConfig, smsEnabled: false, smsApiKey: undefined });
    expect(result.ready).toBe(true);
    expect(result.items.find((i) => i.key === "sms")?.ready).toBe(false);
  });

  it("requires a strong encryption key", () => {
    const result = evaluateProductionReadiness({ ...fullConfig, encryptionKey: "short" });
    expect(result.items.find((i) => i.key === "encryption")?.ready).toBe(false);
  });
});
