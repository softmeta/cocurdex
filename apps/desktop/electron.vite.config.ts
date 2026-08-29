import { createRequire } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { getWorkspaceDependencyNames } from "./electron-vite-workspace-dependencies";

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

const alias = {
  "@": path.resolve(__dirname, "src"),
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
  "@cocurdex/db": path.resolve(__dirname, "../../packages/db/src/index.ts"),
  "@cocurdex/daemon/client": path.resolve(
    __dirname,
    "../../packages/daemon/src/client.ts",
  ),
  "@cocurdex/llm-chat": path.resolve(
    __dirname,
    "../../packages/llm-chat/src/index.ts",
  ),
  "@cocurdex/product-skills": path.resolve(
    __dirname,
    "../../packages/product-skills/src/index.ts",
  ),
  "@cocurdex/rpc": path.resolve(__dirname, "../../packages/rpc/src/index.ts"),
};

export default defineConfig({
  main: {
    resolve: {
      alias,
    },
    build: {
      externalizeDeps: {
        exclude: bundledWorkspaceDependencies,
      },
      lib: {
        entry: "electron/main.ts",
      },
    },
  },
  preload: {
    resolve: {
      alias,
    },
    build: {
      externalizeDeps: {
        exclude: bundledWorkspaceDependencies,
      },
      rollupOptions: {
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
        },
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler", { target: "19" }]],
        },
      }),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: path.join(pdfjsDistRoot, "cmaps").replace(/\\/g, "/"),
            dest: "",
          },
          {
            src: path.join(pdfjsDistRoot, "standard_fonts").replace(/\\/g, "/"),
            dest: "",
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
    // Strip non-actionable console noise from the production renderer bundle.
    // Marked pure so esbuild's minifier drops these calls in prod builds while
    // dev (unminified) keeps them. console.warn/error stay for real failures.
    esbuild: {
      pure: ["console.log", "console.info", "console.debug"],
    },
    build: {
      rollupOptions: {
        input: {
          index: "index.html",
        },
      },
    },
  },
});
