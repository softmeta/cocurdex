/**
 * Bundle @cocurdex/cli into resources/cli/cli.mjs for packaged installs.
 * Launcher scripts (cocurdex / cocurdex.cmd) stay checked-in next to the bundle
 * and invoke Electron with ELECTRON_RUN_AS_NODE=1 (VS Code-style).
 */
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const outDir = path.join(desktopRoot, "resources", "cli");
const entry = path.join(repoRoot, "apps/cli/src/index.ts");
const daemonEntry = path.join(repoRoot, "packages/daemon/src/bin.ts");
const piPackagePath = await realpath(
  path.join(
    repoRoot,
    "packages/agent-adapters/node_modules/@earendil-works/pi-coding-agent",
  ),
);
const photonWasmPath = path.resolve(
  piPackagePath,
  "../..",
  "@silvia-odwyer/photon-node/photon_rs_bg.wasm",
);
const cliPackageJson = JSON.parse(
  await readFile(path.join(repoRoot, "apps/cli/package.json"), "utf8"),
);
const cliVersion =
  typeof cliPackageJson.version === "string" ? cliPackageJson.version : "0.0.0";

const alias = {
  // Subpath exports must be listed before the package root alias, otherwise
  // Vite resolves `@cocurdex/daemon/paths` as `index.ts/paths`.
  "@cocurdex/daemon/client": path.join(
    repoRoot,
    "packages/daemon/src/client.ts",
  ),
  "@cocurdex/daemon/paths": path.join(repoRoot, "packages/daemon/src/paths.ts"),
  "@cocurdex/daemon": path.join(repoRoot, "packages/daemon/src/index.ts"),
  "@cocurdex/agent-adapters": path.join(
    repoRoot,
    "packages/agent-adapters/src/index.ts",
  ),
  "@cocurdex/agent-core": path.join(
    repoRoot,
    "packages/agent-core/src/index.ts",
  ),
  "@cocurdex/db": path.join(repoRoot, "packages/db/src/index.ts"),
  "@cocurdex/rpc": path.join(repoRoot, "packages/rpc/src/index.ts"),
  "@cocurdex/shared": path.join(repoRoot, "packages/shared/src/index.ts"),
};

await mkdir(outDir, { recursive: true });
await rm(path.join(outDir, "daemon.mjs"), { force: true });

await build({
  configFile: false,
  logLevel: "warn",
  resolve: { alias },
  define: {
    // Packaged cli.mjs has no package.json beside it — inline the version.
    __COCURDEX_CLI_VERSION__: JSON.stringify(cliVersion),
  },
  build: {
    outDir,
    emptyOutDir: false,
    target: "node20",
    minify: false,
    sourcemap: false,
    ssr: true,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "cli.mjs",
    },
    rollupOptions: {
      output: {
        entryFileNames: "cli.mjs",
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    // Bundle workspace packages so the shipped CLI has no monorepo deps.
    noExternal: true,
  },
});
await copyFile(photonWasmPath, path.join(outDir, "photon_rs_bg.wasm"));

await build({
  configFile: false,
  logLevel: "warn",
  resolve: { alias },
  build: {
    outDir,
    emptyOutDir: false,
    target: "node20",
    minify: false,
    sourcemap: false,
    ssr: true,
    lib: {
      entry: daemonEntry,
      formats: ["cjs"],
      fileName: () => "daemon.cjs",
    },
    rollupOptions: {
      output: {
        entryFileNames: "daemon.cjs",
        inlineDynamicImports: true,
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});

const posixLauncher = path.join(outDir, "cocurdex");
try {
  await chmod(posixLauncher, 0o755);
} catch {
  // Launcher may be missing only if someone deleted the committed wrapper.
}

console.info(`[build-cli] wrote ${path.join(outDir, "cli.mjs")}`);
console.info(`[build-cli] wrote ${path.join(outDir, "daemon.cjs")}`);
