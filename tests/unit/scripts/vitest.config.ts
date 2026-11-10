import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@scripts\//,
        replacement: `${path.resolve(import.meta.dirname, "../../../scripts")}/`,
      },
    ],
  },
});
