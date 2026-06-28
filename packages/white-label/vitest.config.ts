import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "white-label", environment: "node", include: ["src/**/*.test.ts"] },
});
