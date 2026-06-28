import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "workers", environment: "node", include: ["src/**/*.test.ts"] },
});
