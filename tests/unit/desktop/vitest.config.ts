import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const desktopRoot = path.resolve(import.meta.dirname, "../../../apps/desktop");
const packagesRoot = path.resolve(import.meta.dirname, "../../../packages");

const packageEntries: Record<string, string> = {
  "@cocurdex/shared/node": "shared/src/node.ts",
  "@cocurdex/shared": "shared/src/index.ts",
  "@cocurdex/rpc/client": "rpc/src/client.ts",
  "@cocurdex/rpc/method-scopes": "rpc/src/method-scopes.ts",
  "@cocurdex/rpc": "rpc/src/index.ts",
  "@cocurdex/client-runtime": "client-runtime/src/index.ts",
  "@cocurdex/daemon/client": "daemon/src/client.ts",
  "@cocurdex/daemon/paths": "daemon/src/paths.ts",
  "@cocurdex/daemon": "daemon/src/index.ts",
  "@cocurdex/agent-core": "agent-core/src/index.ts",
  "@cocurdex/agent-adapters/desktop-provider":
    "agent-adapters/src/desktop-provider.ts",
  "@cocurdex/agent-adapters": "agent-adapters/src/index.ts",
  "@cocurdex/db": "db/src/index.ts",
  "@cocurdex/note-doc/bytes": "note-doc/src/bytes.ts",
  "@cocurdex/note-doc": "note-doc/src/index.ts",
};

const packageAliases = Object.entries(packageEntries).map(([find, entry]) => ({
  find: new RegExp(`^${find}$`),
  replacement: path.join(packagesRoot, entry),
}));

export default defineConfig({
  plugins: [react() as never],
  resolve: {
    alias: [
      { find: /^@\//, replacement: `${path.join(desktopRoot, "src")}/` },
      { find: /^@desktop\//, replacement: `${desktopRoot}/` },
      ...packageAliases,
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./setup.ts"],
  },
});
