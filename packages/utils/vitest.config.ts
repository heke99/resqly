import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "utils",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
