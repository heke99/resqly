import { RateLimiter } from "@resqly/utils";
import type { ApiRepo } from "./repo/types";

export interface AppConfig {
  repo: ApiRepo;
  maps: { serverKey?: string; routesEnabled: boolean };
  bankid: { env: "mock" | "test" | "production"; mockEnabled: boolean };
  /** Pepper for hashing personal numbers (ENCRYPTION_KEY). */
  encryptionKey: string;
  rateLimiter?: RateLimiter;
  driverAuth?: { getUserIdFromAccessToken(token: string): Promise<string | null> };
}

export interface ApiContext {
  config: AppConfig;
  repo: ApiRepo;
  tenantId: string;
  apiClientId: string;
  requestId: string;
  ip: string | null;
  driverUserId?: string | null;
  driverId?: string | null;
  idempotencyKey?: string | null;
}

export function defaultRateLimiter(): RateLimiter {
  // 600 requests/min per tenant by default.
  return new RateLimiter(600, 60_000);
}
