import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "tow", environment: "node", include: ["src/**/*.test.ts"] },
});
