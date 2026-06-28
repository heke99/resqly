import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "audit", environment: "node", include: ["src/**/*.test.ts"] },
});
