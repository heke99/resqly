import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "maps", environment: "node", include: ["src/**/*.test.ts"] },
});
