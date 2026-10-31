import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./helpers/setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "desktop-smoke.test.ts",
      "bundled-daemon.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
