import { createServer } from "node:http";
import { createServiceClient } from "@resqly/database";
import { boolEnv, optionalEnv, requireEnv } from "@resqly/utils";
import { App } from "./app";
import { SupabaseRepo } from "./repo/supabase";

function buildApp(): App {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const db = createServiceClient(supabaseUrl, serviceKey);
  return new App({
    repo: new SupabaseRepo(db),
    maps: {
      serverKey: optionalEnv("GOOGLE_MAPS_SERVER_KEY") || undefined,
      routesEnabled: boolEnv("GOOGLE_MAPS_ROUTES_API_ENABLED", true),
    },
    bankid: {
      env: (optionalEnv("BANKID_ENV", "test") as "mock" | "test" | "production") ?? "test",
      mockEnabled: boolEnv("BANKID_MOCK_ENABLED", true),
    },
    encryptionKey: optionalEnv("ENCRYPTION_KEY", "dev-pepper-change-me"),
    push: {
      enabled: boolEnv("EXPO_PUSH_ENABLED", true),
      url: optionalEnv("EXPO_PUSH_URL") || undefined,
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
      ip: req.socket.remoteAddress ?? null,
    });
    res.writeHead(result.status, { "content-type": "application/json", ...(result.headers ?? {}) });
    res.end(JSON.stringify(result.body ?? null));
  });
});

server.listen(port, () => {
  console.log(`[api] partner API listening on :${port}`);
});
