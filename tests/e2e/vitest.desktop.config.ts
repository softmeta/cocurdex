import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./helpers/setup.ts"],
    include: ["desktop/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
