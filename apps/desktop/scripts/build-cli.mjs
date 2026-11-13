import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { build } from "vite";
import { buildPolicyDefine } from "./build-policy-define.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const committedCliDir = path.join(desktopRoot, "resources", "cli");
const { values: cliArgs } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { "out-dir": { type: "string" } },
});
const outDir = cliArgs["out-dir"]
  ? path.resolve(desktopRoot, cliArgs["out-dir"])
  : committedCliDir;
const productSkillsSource = path.join(
  repoRoot,
  "packages/product-skills/skills",
);
const productSkillsOut = path.join(desktopRoot, "resources", "skills");
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
const quickjsWasmPath = path.resolve(
  piPackagePath,
  "../../quickjs-wasi/quickjs.wasm",
);
const codemodeWorkerEntry = path.resolve(
  piPackagePath,
  "../pi-codemode/dist/runtime/worker.js",
);
const desktopPackageJson = JSON.parse(
  await readFile(path.join(desktopRoot, "package.json"), "utf8"),
);
const cliVersion =
  typeof desktopPackageJson.version === "string"
    ? desktopPackageJson.version
    : "0.0.0";

function piPackageBesideBundle() {
  const piConfigModule = "/@earendil-works/pi-coding-agent/dist/config.js";
  const packageDirLookup = "return findNodePackageDir(__dirname);";
  let applied = false;
  return {
    name: "cocurdex-pi-package-beside-bundle",
    transform(code, id) {
      if (!id.replaceAll("\\", "/").endsWith(piConfigModule)) return null;
      if (!code.includes(packageDirLookup)) {
        throw new Error(`pi config.js no longer contains: ${packageDirLookup}`);
      }
      applied = true;
      return {
        code: code.replace(
          packageDirLookup,
          'return join(__dirname, "pi-package");',
        ),
        map: null,
      };
    },
    buildEnd(error) {
      if (!error && !applied) {
        throw new Error("pi config.js was not bundled; pi-package not wired");
      }
    },
  };
}

const quickjsWasmBesideDaemon = {
  name: "cocurdex-quickjs-wasm-beside-daemon",
  transform(code) {
    const specifier = '"quickjs-wasi/quickjs.wasm"';
    if (!code.includes(specifier)) return null;
    return { code: code.replaceAll(specifier, '"./quickjs.wasm"'), map: null };
  },
};

const alias = {
  "@cocurdex/daemon/background-launch": path.join(
    repoRoot,
    "packages/daemon/src/background/launch-args.ts",
  ),
  "@cocurdex/daemon/client": path.join(
    repoRoot,
    "packages/daemon/src/client.ts",
  ),
  "@cocurdex/daemon/paths": path.join(repoRoot, "packages/daemon/src/paths.ts"),
  "@cocurdex/daemon": path.join(repoRoot, "packages/daemon/src/index.ts"),
  "@cocurdex/agent-adapters/provider-auth": path.join(
    repoRoot,
    "packages/agent-adapters/src/provider-auth.ts",
  ),
  "@cocurdex/agent-adapters/pi-mcp": path.join(
    repoRoot,
    "packages/agent-adapters/src/pi-mcp.ts",
  ),
  "@cocurdex/agent-adapters": path.join(
    repoRoot,
    "packages/agent-adapters/src/index.ts",
  ),
  "@cocurdex/agent-core": path.join(
    repoRoot,
    "packages/agent-core/src/index.ts",
  ),
  "@cocurdex/db": path.join(repoRoot, "packages/db/src/index.ts"),
  "@cocurdex/note-doc": path.join(repoRoot, "packages/note-doc/src/index.ts"),
  "@cocurdex/rpc/client": path.join(repoRoot, "packages/rpc/src/client.ts"),
  "@cocurdex/rpc/method-scopes": path.join(
    repoRoot,
    "packages/rpc/src/method-scopes.ts",
  ),
  "@cocurdex/rpc": path.join(repoRoot, "packages/rpc/src/index.ts"),
  "@cocurdex/shared/node": path.join(repoRoot, "packages/shared/src/node.ts"),
  "@cocurdex/shared": path.join(repoRoot, "packages/shared/src/index.ts"),
};

await mkdir(outDir, { recursive: true });
await rm(path.join(outDir, "daemon.mjs"), { force: true });
await rm(path.join(outDir, "node_modules"), { force: true, recursive: true });
for (const file of await readdir(outDir)) {
  if (/^cli-.+\.mjs$/.test(file)) {
    await rm(path.join(outDir, file), { force: true });
  }
}

await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  resolve: { alias },
  plugins: [piPackageBesideBundle()],
  define: {
    __COCURDEX_CLI_VERSION__: JSON.stringify(cliVersion),
    ...buildPolicyDefine(),
  },
  build: {
    outDir,
    emptyOutDir: false,
    target: "node20",
    minify: true,
    sourcemap: false,
    ssr: true,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "cli.mjs",
    },
    rolldownOptions: {
      output: {
        entryFileNames: "cli.mjs",
        chunkFileNames: "cli-[name]-[hash].mjs",
        keepNames: true,
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
await copyFile(photonWasmPath, path.join(outDir, "photon_rs_bg.wasm"));
await rm(productSkillsOut, { force: true, recursive: true });
await cp(productSkillsSource, productSkillsOut, { recursive: true });
const piThemeSource = path.join(piPackagePath, "dist/modes/interactive/theme");
const piThemeTarget = path.join(
  outDir,
  "pi-package/dist/modes/interactive/theme",
);
await mkdir(piThemeTarget, { recursive: true });
await copyFile(
  path.join(piPackagePath, "package.json"),
  path.join(outDir, "pi-package/package.json"),
);
for (const theme of ["dark.json", "light.json"]) {
  await copyFile(
    path.join(piThemeSource, theme),
    path.join(piThemeTarget, theme),
  );
}

await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  resolve: { alias },
  plugins: [quickjsWasmBesideDaemon, piPackageBesideBundle()],
  define: buildPolicyDefine(),
  build: {
    outDir,
    emptyOutDir: false,
    target: "node20",
    minify: true,
    sourcemap: false,
    ssr: true,
    lib: {
      entry: daemonEntry,
      formats: ["cjs"],
      fileName: () => "daemon.cjs",
    },
    commonjsOptions: { ignore: ["bufferutil", "utf-8-validate"] },
    rolldownOptions: {
      output: {
        entryFileNames: "daemon.cjs",
        keepNames: true,
        externalLiveBindings: false,
        codeSplitting: false,
      },
    },
  },
  ssr: {
    noExternal: true,
    external: ["@napi-rs/keyring", "font-list", "node-pty"],
  },
});

await build({
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    outDir,
    emptyOutDir: false,
    target: "node20",
    minify: true,
    sourcemap: false,
    ssr: true,
    lib: {
      entry: codemodeWorkerEntry,
      formats: ["es"],
      fileName: () => "worker.js",
    },
    rolldownOptions: {
      output: { entryFileNames: "worker.js", codeSplitting: false },
    },
  },
  ssr: { noExternal: true },
});
await copyFile(quickjsWasmPath, path.join(outDir, "quickjs.wasm"));

if (outDir !== committedCliDir) {
  for (const launcher of ["cocurdex", "cocurdex.cmd"]) {
    await copyFile(
      path.join(committedCliDir, launcher),
      path.join(outDir, launcher),
    );
  }
}

const posixLauncher = path.join(outDir, "cocurdex");
try {
  await chmod(posixLauncher, 0o755);
} catch {}

console.info(`[build-cli] wrote ${path.join(outDir, "cli.mjs")}`);
console.info(`[build-cli] wrote ${path.join(outDir, "daemon.cjs")}`);
console.info(`[build-cli] wrote ${path.join(outDir, "worker.js")}`);
