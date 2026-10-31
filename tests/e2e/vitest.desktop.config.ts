import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./helpers/setup.ts"],
    include: ["desktop-smoke.test.ts", "bundled-daemon.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
