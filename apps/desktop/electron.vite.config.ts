import { createRequire } from "node:module";
import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { getWorkspaceDependencyNames } from "./electron-vite-workspace-dependencies";
import { buildPolicyDefine } from "./scripts/build-policy-define.mjs";

// pdf.js ships cMaps (CJK glyph maps) and standard fonts as separate assets the
// renderer fetches at runtime. They must land in the renderer output so the
// packaged build (electron-builder only bundles out/**) can resolve `/cmaps/`
// and `/standard_fonts/`. Resolve the package directory through Node so the
// pnpm symlinked layout is handled correctly.
const require = createRequire(import.meta.url);
const pdfjsDistRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
const desktopPackage = require("./package.json") as {
  dependencies?: Record<string, string>;
};
const bundledWorkspaceDependencies = getWorkspaceDependencyNames(
  desktopPackage.dependencies,
);

const sideEffectFreeWorkspaceSources = ["client-runtime", "secure-channel"].map(
  (name) => path.resolve(__dirname, "../../packages", name, "src"),
);

function sourceDirectoryPattern(root: string) {
  const escaped = root
    .split(/[\\/]/)
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\\\/]");
  return new RegExp(`^${escaped}[\\\\/]`, "i");
}

const alias = {
  "@": path.resolve(__dirname, "src"),
  "@cocurdex/shared/node": path.resolve(
    __dirname,
    "../../packages/shared/src/node.ts",
  ),
  "@cocurdex/shared": path.resolve(
    __dirname,
    "../../packages/shared/src/index.ts",
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
  "@cocurdex/deck": path.resolve(__dirname, "../../packages/deck/src/index.ts"),
  "@cocurdex/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
  "@cocurdex/note-doc/bytes": path.resolve(
    __dirname,
    "../../packages/note-doc/src/bytes.ts",
  ),
  "@cocurdex/note-doc": path.resolve(
    __dirname,
    "../../packages/note-doc/src/index.ts",
  ),
  "@cocurdex/daemon/background-launch": path.resolve(
    __dirname,
    "../../packages/daemon/src/background/launch-args.ts",
  ),
  "@cocurdex/daemon/client": path.resolve(
    __dirname,
    "../../packages/daemon/src/client.ts",
  ),
  "@cocurdex/daemon/paths": path.resolve(
    __dirname,
    "../../packages/daemon/src/paths.ts",
  ),
  "@cocurdex/product-skills": path.resolve(
    __dirname,
    "../../packages/product-skills/src/index.ts",
  ),
  "@cocurdex/rpc/client": path.resolve(
    __dirname,
    "../../packages/rpc/src/client.ts",
  ),
  "@cocurdex/client-runtime/remote-files": path.resolve(
    __dirname,
    "../../packages/client-runtime/src/remote-files.ts",
  ),
  "@cocurdex/client-runtime/secure-transport": path.resolve(
    __dirname,
    "../../packages/client-runtime/src/secure-transport.ts",
  ),
  "@cocurdex/client-runtime": path.resolve(
    __dirname,
    "../../packages/client-runtime/src/index.ts",
  ),
  "@cocurdex/rpc/method-scopes": path.resolve(
    __dirname,
    "../../packages/rpc/src/method-scopes.ts",
  ),
  "@cocurdex/rpc": path.resolve(__dirname, "../../packages/rpc/src/index.ts"),
};

export default defineConfig(({ command }) => ({
  main: {
    define: buildPolicyDefine(),
    resolve: {
      alias,
    },
    build: {
      minify: command === "build",
      externalizeDeps: {
        exclude: bundledWorkspaceDependencies,
      },
      lib: {
        entry: "electron/main.ts",
      },
      rolldownOptions: {
        output: {
          keepNames: true,
        },
      },
    },
  },
  preload: {
    resolve: {
      alias,
    },
    build: {
      isolatedEntries: true,
      minify: command === "build",
      externalizeDeps: {
        exclude: bundledWorkspaceDependencies,
      },
      rolldownOptions: {
        input: {
          preload: path.resolve(__dirname, "electron/preload.ts"),
          "browser-preload": path.resolve(
            __dirname,
            "electron/browser-preload.ts",
          ),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          keepNames: true,
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset({ target: "19" })] }),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: path.join(pdfjsDistRoot, "cmaps/*").replace(/\\/g, "/"),
            dest: "cmaps",
            rename: { stripBase: true },
          },
          {
            src: path
              .join(pdfjsDistRoot, "standard_fonts/*")
              .replace(/\\/g, "/"),
            dest: "standard_fonts",
            rename: { stripBase: true },
          },
        ],
      }),
    ],
    resolve: {
      alias,
    },
    optimizeDeps: {
      exclude: ["monaco-editor", "@monaco-editor/react"],
    },
    build: {
      minify: command === "build",
      manifest: true,
      rolldownOptions: {
        input: {
          index: "index.html",
        },
        treeshake: {
          moduleSideEffects: sideEffectFreeWorkspaceSources.map((root) => ({
            test: sourceDirectoryPattern(root),
            sideEffects: false,
          })),
          manualPureFunctions: ["console.log", "console.info", "console.debug"],
        },
      },
    },
  },
}));
