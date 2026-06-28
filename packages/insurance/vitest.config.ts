import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "insurance", environment: "node", include: ["src/**/*.test.ts"] },
});
