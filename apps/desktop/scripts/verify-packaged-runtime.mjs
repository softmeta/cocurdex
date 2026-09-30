import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import electronPath from "electron";
import { nativeIdMatchesTarget } from "./packaging-native-filters.mjs";

const REQUIRED_ASAR_PATHS = [
  "node_modules/jiti/lib/jiti-static.mjs",
  "node_modules/@earendil-works/pi-coding-agent/package.json",
  "node_modules/@earendil-works/pi-codemode/package.json",
  "out/main/main.js",
];

const FORBIDDEN_ASAR_PATHS = [
  ".tsbuildinfo",
  "electron",
  "electron-vite-workspace-dependencies.test.ts",
  "electron-vite-workspace-dependencies.ts",
  "electron.vite.config.ts",
  "scripts",
  "src",
  "node_modules/esbuild/bin",
  "node_modules/@earendil-works/pi-coding-agent/dist/bundle",
];

const FORBIDDEN_ASAR_PACKAGE_PREFIXES = [
  "@anthropic-ai/claude-agent-sdk-",
  "recheck-",
];

async function findAsarFiles(rootPath) {
  const found = [];

  async function visit(directoryPath, depth) {
    if (depth > 6) return;

    let entries;
    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isFile() && entry.name === "app.asar") {
        found.push(entryPath);
        continue;
      }
      if (entry.isDirectory()) {
        await visit(entryPath, depth + 1);
      }
    }
  }

  await visit(rootPath, 0);
  return found;
}

async function findPackagedExecutable(asarPath) {
  const resourcesPath = path.dirname(asarPath);
  const candidates =
    process.platform === "darwin"
      ? await readdir(path.join(resourcesPath, "..", "MacOS"), {
          withFileTypes: true,
        })
      : await readdir(path.join(resourcesPath, ".."), {
          withFileTypes: true,
        });
  const executableDirectory =
    process.platform === "darwin"
      ? path.join(resourcesPath, "..", "MacOS")
      : path.join(resourcesPath, "..");

  for (const candidate of candidates) {
    if (!candidate.isFile()) continue;
    if (process.platform === "win32" && !candidate.name.endsWith(".exe")) {
      continue;
    }

    const candidatePath = path.join(executableDirectory, candidate.name);
    const candidateStat = await stat(candidatePath);
    if (process.platform === "win32" || (candidateStat.mode & 0o111) !== 0) {
      return candidatePath;
    }
  }

  return null;
}

async function inspectAsar(asarPath) {
  const packagedExecutable = await findPackagedExecutable(asarPath);
  const expectedResourcesPath = path.dirname(asarPath);
  const inspectionScript = `
    const fs = require("node:fs");
    const { execFileSync } = require("node:child_process");
    const { createRequire } = require("node:module");
    const path = require("node:path");
    const { pathToFileURL } = require("node:url");
    const { runInNewContext } = require("node:vm");
    const asarPath = ${JSON.stringify(asarPath)};
    const expectedResourcesPath = ${JSON.stringify(expectedResourcesPath)};
    const verifyResourcesPath = ${JSON.stringify(Boolean(packagedExecutable))};
    const required = ${JSON.stringify(REQUIRED_ASAR_PATHS)};
    const forbidden = ${JSON.stringify(FORBIDDEN_ASAR_PATHS)};
    const forbiddenPackagePrefixes = ${JSON.stringify(FORBIDDEN_ASAR_PACKAGE_PREFIXES)};
    const nativeIdMatchesTarget = ${nativeIdMatchesTarget.toString()};
    void (async () => {
      const missing = required.filter((entry) =>
        !fs.existsSync(path.join(asarPath, entry)),
      );
      const unexpected = forbidden.filter((entry) =>
        fs.existsSync(path.join(asarPath, entry)),
      );
      for (const packagePrefix of forbiddenPackagePrefixes) {
        const packageDirectory = path.posix.dirname(packagePrefix);
        const packageNamePrefix = path.posix.basename(packagePrefix);
        const packageDirectoryPath = path.join(
          asarPath,
          "node_modules",
          packageDirectory,
        );
        if (!fs.existsSync(packageDirectoryPath)) continue;
        for (const packageName of fs.readdirSync(packageDirectoryPath)) {
          if (packageName.startsWith(packageNamePrefix)) {
            unexpected.push(
              path.posix.join("node_modules", packageDirectory, packageName),
            );
          }
        }
      }
      function collectWrongArchNatives(rootPath) {
        const scopes = [
          ["@esbuild", ""],
          ["@napi-rs", "keyring-"],
          ["@vscode", "ripgrep-"],
        ];
        for (const [scope, prefix] of scopes) {
          const dir = path.join(rootPath, "node_modules", scope);
          if (!fs.existsSync(dir)) continue;
          for (const name of fs.readdirSync(dir)) {
            if (!name.startsWith(prefix)) continue;
            if (
              !nativeIdMatchesTarget(
                name.slice(prefix.length),
                process.platform,
                process.arch,
              )
            ) {
              unexpected.push(path.posix.join("node_modules", scope, name));
            }
          }
        }
        const prebuilds = path.join(
          rootPath,
          "node_modules",
          "node-pty",
          "prebuilds",
        );
        if (!fs.existsSync(prebuilds)) return;
        for (const name of fs.readdirSync(prebuilds)) {
          if (
            !nativeIdMatchesTarget(name, process.platform, process.arch)
          ) {
            unexpected.push(
              path.posix.join("node_modules", "node-pty", "prebuilds", name),
            );
          }
        }
      }
      collectWrongArchNatives(asarPath);
      const unpackedRoot = path.join(
        expectedResourcesPath,
        "app.asar.unpacked",
      );
      if (fs.existsSync(unpackedRoot)) {
        collectWrongArchNatives(unpackedRoot);
      }
      if (verifyResourcesPath && process.resourcesPath !== expectedResourcesPath) {
        throw new Error(
          \`Expected process.resourcesPath to be \${expectedResourcesPath}, received \${process.resourcesPath}\`,
        );
      }

      const fdRoot = path.join(expectedResourcesPath, "vendor", "fd");
      const fdTarget = process.platform + "-" + process.arch;
      const fdTargets = fs.readdirSync(fdRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
      if (fdTargets.length !== 1 || fdTargets[0] !== fdTarget) {
        throw new Error(
          "Expected only fd target " + fdTarget + ", received " + fdTargets.join(", "),
        );
      }
      const fdManifest = JSON.parse(
        fs.readFileSync(path.join(fdRoot, "manifest.json"), "utf8"),
      );
      const fdExecutable = path.join(
        fdRoot,
        fdTarget,
        process.platform === "win32" ? "fd.exe" : "fd",
      );
      const fdVersion = execFileSync(fdExecutable, ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
      }).trim();
      if (fdVersion !== "fd " + fdManifest.version) {
        throw new Error("Unexpected packaged fd version: " + fdVersion);
      }

      const mainEntryPath = path.join(asarPath, "out", "main", "main.js");
      const mainRequire = createRequire(mainEntryPath);
      const esbuild = mainRequire(
        path.join(unpackedRoot, "node_modules", "esbuild", "lib", "main.js"),
      );
      const bundled = await esbuild.build({
        stdin: {
          contents: "export const value: number = 5;",
          loader: "ts",
        },
        bundle: true,
        format: "cjs",
        platform: "node",
        write: false,
      });
      esbuild.stop();
      const bundledModule = { exports: {} };
      runInNewContext(bundled.outputFiles[0].text, { module: bundledModule });
      if (bundledModule.exports.value !== 5) {
        throw new Error("Packaged esbuild failed to bundle TypeScript");
      }
      const daemonKeyring = mainRequire("@napi-rs/keyring");
      if (typeof daemonKeyring.AsyncEntry !== "function") {
        throw new Error("Packaged daemon keyring native module did not load");
      }
      const piPackageDir = path.join(
        asarPath,
        "node_modules",
        "@earendil-works",
        "pi-coding-agent",
      );
      const piPackage = JSON.parse(
        fs.readFileSync(path.join(piPackageDir, "package.json"), "utf8"),
      );
      const piImport = piPackage.exports?.["."]?.import;
      if (typeof piImport !== "string") {
        throw new Error("Packaged Pi SDK has no ESM export");
      }
      const { ModelRuntime } = await import(
        pathToFileURL(path.join(piPackageDir, piImport)).href
      );
      if (typeof ModelRuntime?.create !== "function") {
        throw new Error("Packaged Pi SDK has no ModelRuntime.create");
      }
      const daemonPath = path.join(expectedResourcesPath, "cli", "daemon.cjs");
      const quickjsWasmPath = createRequire(daemonPath).resolve(
        "./quickjs.wasm",
      );
      if (fs.readFileSync(daemonPath, "utf8").includes("quickjs-wasi/quickjs.wasm")) {
        throw new Error("Packaged daemon resolves QuickJS wasm as a package");
      }
      const codemode = await import(
        pathToFileURL(
          path.join(
            asarPath,
            "node_modules",
            "@earendil-works",
            "pi-codemode",
            "dist",
            "index.js",
          ),
        ).href
      );
      const sandbox = new codemode.CodemodeSandbox({
        wasm: codemode.loadQuickJSWasm(quickjsWasmPath),
        workerUrl: new URL("./worker.js", pathToFileURL(daemonPath)),
        tools: [{
          name: "add",
          description: "Add two numbers",
          execute: async ({ x, y }) => x + y,
        }],
      });
      const codemodeResult = await sandbox.execute(
        "text(String(await tools.add({ x: 2, y: 3 })));",
      );
      await sandbox.close();
      if (!codemodeResult.ok || codemodeResult.output[0]?.text !== "5") {
        throw new Error(
          "Packaged codemode sandbox failed: " + JSON.stringify(codemodeResult),
        );
      }

      process.stdout.write(JSON.stringify({ missing, unexpected }));
    })().catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  const result = spawnSync(
    packagedExecutable ?? electronPath,
    ["-e", inspectionScript],
    {
      encoding: "utf8",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      timeout: 60_000,
    },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "Electron ASAR inspection failed");
  }

  return JSON.parse(result.stdout);
}

const releasePath = path.resolve(process.argv[2] ?? "release");
const asarFiles = await findAsarFiles(releasePath);
if (asarFiles.length === 0) {
  throw new Error(`No app.asar found below ${releasePath}`);
}

for (const asarPath of asarFiles) {
  const updateConfigPath = path.join(path.dirname(asarPath), "app-update.yml");
  try {
    await stat(updateConfigPath);
  } catch {
    throw new Error(`Missing app-update.yml next to ${asarPath}`);
  }

  const { missing, unexpected } = await inspectAsar(asarPath);
  if (missing.length > 0) {
    throw new Error(
      `Packaged runtime is incomplete at ${asarPath}: missing ${missing.join(", ")}`,
    );
  }
  if (unexpected.length > 0) {
    throw new Error(
      `Packaged runtime contains forbidden files at ${asarPath}: ${unexpected.join(", ")}`,
    );
  }
}

console.log(
  `Verified packaged runtime in ${asarFiles.length} app.asar file(s)`,
);
