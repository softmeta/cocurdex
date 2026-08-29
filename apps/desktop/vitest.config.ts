import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(__dirname, "src"),
  "@cocurdex/shared": path.resolve(
    __dirname,
    "../../packages/shared/src/index.ts",
  ),
  "@cocurdex/rpc": path.resolve(__dirname, "../../packages/rpc/src/index.ts"),
  "@cocurdex/daemon/client": path.resolve(
    __dirname,
    "../../packages/daemon/src/client.ts",
  ),
  "@cocurdex/daemon/paths": path.resolve(
    __dirname,
    "../../packages/daemon/src/paths.ts",
  ),
  "@cocurdex/daemon": path.resolve(
    __dirname,
    "../../packages/daemon/src/index.ts",
  ),
  "@cocurdex/agent-core": path.resolve(
    __dirname,
    "../../packages/agent-core/src/index.ts",
  ),
  "@cocurdex/agent-adapters/desktop-provider": path.resolve(
    __dirname,
    "../../packages/agent-adapters/src/desktop-provider.ts",
  ),
  "@cocurdex/agent-adapters": path.resolve(
    __dirname,
    "../../packages/agent-adapters/src/index.ts",
  ),
  "@cocurdex/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
  "@cocurdex/llm-chat": path.resolve(
    __dirname,
    "../../packages/llm-chat/src/index.ts",
  ),
};

export default defineConfig({
  plugins: [react() as never],
  resolve: {
    alias,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
