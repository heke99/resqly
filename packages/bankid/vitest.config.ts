import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "bankid", environment: "node", include: ["src/**/*.test.ts"] },
});
