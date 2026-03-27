import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "engine/**/*.test.ts",
      "game/**/*.test.ts",
      "view/**/*.test.ts",
      "tooling/agile-service/**/*.test.ts",
    ],
  },
});
