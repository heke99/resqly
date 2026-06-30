import { createServer } from "node:http";
import { createServiceClient } from "@resqly/database";
import { boolEnv, optionalEnv, requireEnv } from "@resqly/utils";
import { App } from "./app";
import { SupabaseRepo } from "./repo/supabase";

function buildApp(): App {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createServiceClient(supabaseUrl, serviceKey);
  const bankidProvider = optionalEnv("BANKID_PROVIDER", "tic") as "mock" | "tic";
  const bankidEnv = (optionalEnv("BANKID_ENV", "production") as "mock" | "test" | "production") ?? "production";
  const bankidMockEnabled = boolEnv("BANKID_MOCK_ENABLED", false);
  if (process.env.NODE_ENV === "production" && bankidMockEnabled) {
    throw new Error("BANKID_MOCK_ENABLED must be false in production");
  }
  if (bankidProvider === "tic" && !optionalEnv("TIC_API_KEY")) {
    throw new Error("TIC_API_KEY is required when BANKID_PROVIDER=tic");
  }
  return new App({
    repo: new SupabaseRepo(db),
    maps: {
      serverKey: optionalEnv("GOOGLE_MAPS_SERVER_KEY") || undefined,
      routesEnabled: boolEnv("GOOGLE_MAPS_ROUTES_API_ENABLED", true),
      routeMatrixEnabled: boolEnv("GOOGLE_MAPS_ROUTE_MATRIX_ENABLED", true),
    },
    bankid: {
      env: bankidEnv,
      provider: bankidProvider,
      mockEnabled: bankidMockEnabled,
      tic: {
        apiBaseUrl: optionalEnv("TIC_API_BASE_URL", "https://id.tic.io/api/v1"),
        apiKey: optionalEnv("TIC_API_KEY"),
        defaultProvider: "bankid",
        webhookSecret: optionalEnv("TIC_WEBHOOK_SECRET") || undefined,
        callbackBaseUrl: optionalEnv("TIC_CALLBACK_BASE_URL") || undefined,
      },
    },
    encryptionKey: requireEnv("ENCRYPTION_KEY"),
    push: {
      enabled: boolEnv("EXPO_PUSH_ENABLED", true),
      url: optionalEnv("EXPO_PUSH_URL") || undefined,
    },
    email: {
      enabled: boolEnv("NOTIFICATIONS_EMAIL_ENABLED", true),
      resendApiKey: optionalEnv("RESEND_API_KEY") || undefined,
      from: optionalEnv("EMAIL_FROM") || undefined,
      replyTo: optionalEnv("EMAIL_REPLY_TO") || undefined,
    },
    driverAuth: {
      async getUserIdFromAccessToken(token: string) {
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) return null;
        return data.user.id;
      },
    },
  });
}

const port = Number(process.env.PORT ?? 4000);
const app = buildApp();

const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", async () => {
    let body: unknown = undefined;
    const raw = Buffer.concat(chunks).toString("utf8");
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = undefined;
      }
    }
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
    }
    const result = await app.handle({
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers,
      body,
      rawBody: raw,
      ip: req.socket.remoteAddress ?? null,
    });
    res.writeHead(result.status, { "content-type": "application/json", ...(result.headers ?? {}) });
    res.end(JSON.stringify(result.body ?? null));
  });
});

server.listen(port, () => {
  console.log(`[api] partner API listening on :${port}`);
});
