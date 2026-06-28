import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "dispatch", environment: "node", include: ["src/**/*.test.ts"] },
});
