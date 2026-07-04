/**
 * Hard server-side production guards.
 *
 * Production must never run mock BankID, demo seeds or other test-only flows.
 * These helpers are pure (env is passed in or read from process.env) so every
 * app/worker can enforce the same rules and tests can prove the behaviour.
 */

export interface ProductionGuardEnv {
  APP_ENV?: string;
  NODE_ENV?: string;
  BANKID_MOCK_ENABLED?: string;
  BANKID_PROVIDER?: string;
  BANKID_ENV?: string;
}

/** True when the process runs as production (APP_ENV wins over NODE_ENV). */
export function isProductionEnv(env: ProductionGuardEnv = process.env as ProductionGuardEnv): boolean {
  const appEnv = (env.APP_ENV ?? env.NODE_ENV ?? "development").toLowerCase();
  return appEnv === "production";
}

/** True when any mock/test BankID flow is enabled by configuration. */
export function isMockBankidConfigured(env: ProductionGuardEnv = process.env as ProductionGuardEnv): boolean {
  return (
    env.BANKID_MOCK_ENABLED === "true" ||
    env.BANKID_PROVIDER === "mock" ||
    env.BANKID_ENV === "mock" ||
    env.BANKID_ENV === "test"
  );
}

/**
 * Throws when a mock/test BankID configuration is active in production.
 * Call at process start (API/workers) and in every route that could reach a
 * mock provider.
 */
export function assertNoMockBankidInProduction(
  env: ProductionGuardEnv = process.env as ProductionGuardEnv,
): void {
  if (isProductionEnv(env) && isMockBankidConfigured(env)) {
    throw new Error(
      "Mock/test BankID configuration is not allowed in production. " +
        "Set BANKID_PROVIDER=tic, BANKID_ENV=production and BANKID_MOCK_ENABLED=false.",
    );
  }
}

/**
 * Throws when demo/seed flows are invoked in production. Demo data creation
 * is only allowed in local/staging environments.
 */
export function assertDemoAllowed(env: ProductionGuardEnv = process.env as ProductionGuardEnv): void {
  if (isProductionEnv(env)) {
    throw new Error("Demo/staging data creation is blocked in production.");
  }
}

export interface ProductionReadinessInput {
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  encryptionKey?: string;
  bankidProvider?: string;
  ticApiKey?: string;
  googleMapsServerKey?: string;
  resendApiKey?: string;
  emailFrom?: string;
  expoPushEnabled?: boolean;
  smsEnabled?: boolean;
  smsApiKey?: string;
}

export interface ProductionReadinessItem {
  key: string;
  /** Swedish business label shown in the internal operations portal. */
  label: string;
  ready: boolean;
  required: boolean;
}

/**
 * Platform-level configuration readiness. Only shown inside the internal
 * operations portal (Swedish labels) — never to customers or drivers.
 */
export function evaluateProductionReadiness(input: ProductionReadinessInput): {
  items: ProductionReadinessItem[];
  ready: boolean;
} {
  const items: ProductionReadinessItem[] = [
    {
      key: "database",
      label: "Datalagring",
      ready: Boolean(input.supabaseUrl && input.supabaseServiceRoleKey),
      required: true,
    },
    {
      key: "encryption",
      label: "Kryptering av känsliga uppgifter",
      ready: Boolean(input.encryptionKey && input.encryptionKey.length >= 32),
      required: true,
    },
    {
      key: "bankid",
      label: "BankID-verifiering",
      ready: input.bankidProvider === "tic" && Boolean(input.ticApiKey),
      required: true,
    },
    {
      key: "maps",
      label: "Kart- och ruttjänst",
      ready: Boolean(input.googleMapsServerKey),
      required: true,
    },
    {
      key: "email",
      label: "E-postutskick",
      ready: Boolean(input.resendApiKey && input.emailFrom),
      required: true,
    },
    {
      key: "push",
      label: "Push-notiser till förare",
      ready: input.expoPushEnabled !== false,
      required: true,
    },
    {
      key: "sms",
      label: "SMS-utskick (reservkanal)",
      ready: Boolean(input.smsEnabled && input.smsApiKey),
      required: false,
    },
  ];
  return { items, ready: items.filter((i) => i.required).every((i) => i.ready) };
}
