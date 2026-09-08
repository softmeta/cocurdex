import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import electronPath from "electron";

const REQUIRED_ASAR_PATHS = [
  "node_modules/pi-mcp-adapter/package.json",
  "node_modules/pi-mcp-adapter/index.ts",
  "node_modules/jiti/lib/jiti-static.mjs",
  "node_modules/@earendil-works/pi-coding-agent/package.json",
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
  "node_modules/pi-mcp-adapter/banner.png",
  "node_modules/@mariozechner/clipboard-darwin-universal",
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
    const asarPath = ${JSON.stringify(asarPath)};
    const expectedResourcesPath = ${JSON.stringify(expectedResourcesPath)};
    const verifyResourcesPath = ${JSON.stringify(Boolean(packagedExecutable))};
    const required = ${JSON.stringify(REQUIRED_ASAR_PATHS)};
    const forbidden = ${JSON.stringify(FORBIDDEN_ASAR_PATHS)};
    const forbiddenPackagePrefixes = ${JSON.stringify(FORBIDDEN_ASAR_PACKAGE_PREFIXES)};
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
      if (process.platform === "darwin") {
        const clipboard = mainRequire("@mariozechner/clipboard");
        if (typeof clipboard.getText !== "function") {
          throw new Error("Packaged clipboard native module did not load");
        }
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
      const extensionPath = path.join(
        asarPath,
        "node_modules",
        "pi-mcp-adapter",
        "index.ts",
      );
      const jitiPath = path.join(
        asarPath,
        "node_modules",
        "jiti",
        "lib",
        "jiti-static.mjs",
      );
      const { createJiti } = await import(pathToFileURL(jitiPath).href);
      const jiti = createJiti(pathToFileURL(mainEntryPath).href, {
        moduleCache: false,
        tryNative: false,
      });
      const extension = await jiti.import(extensionPath, { default: true });
      if (typeof extension !== "function") {
        throw new Error("Packaged pi-mcp-adapter has no default factory");
      }

      const mcpRoot = path.dirname(extensionPath);
      const mcpRequire = createRequire(extensionPath);
      const keyring = mcpRequire("@napi-rs/keyring");
      if (typeof keyring.Entry !== "function") {
        throw new Error("Packaged MCP keyring native module did not load");
      }
      function checkSourceMaps(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const entryPath = path.join(directory, entry.name);
          if (entry.isDirectory()) checkSourceMaps(entryPath);
          else if (entry.name.endsWith(".map")) {
            throw new Error("Unexpected MCP source map: " + entryPath);
          }
        }
      }
      checkSourceMaps(mcpRoot);
      const { executeSearch } = await jiti.import(path.join(mcpRoot, "proxy-modes.ts"));
      const searchState = {
        config: { mcpServers: { fixture: { command: "fixture" } } },
        manager: { getConnection: () => ({ status: "connected" }) },
        toolMetadata: new Map([["fixture", [{
          name: "read_file", description: "Read a file", inputSchema: {},
        }]]]),
      };
      const safe = executeSearch(searchState, "^read_file$", true);
      if (safe.details.count !== 1) {
        throw new Error("Packaged MCP regex search failed: " + JSON.stringify(safe.details));
      }
      const unsafe = executeSearch(searchState, "(a+)+$", true);
      if (unsafe.details.error !== "unsafe_pattern") {
        throw new Error("Packaged MCP search accepted an unsafe regex");
      }
      const invalid = executeSearch(searchState, "[", true);
      if (invalid.details.error !== "invalid_pattern") {
        throw new Error("Packaged MCP search accepted an invalid regex");
      }
      const oversized = executeSearch(searchState, "a".repeat(257), true);
      if (oversized.details.error !== "query_too_long") {
        throw new Error("Packaged MCP search lost its regex length limit");
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
