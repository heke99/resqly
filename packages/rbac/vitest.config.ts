import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { name: "rbac", environment: "node", include: ["src/**/*.test.ts"] },
});
