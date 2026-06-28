import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "notifications", environment: "node", include: ["src/**/*.test.ts"] },
});
