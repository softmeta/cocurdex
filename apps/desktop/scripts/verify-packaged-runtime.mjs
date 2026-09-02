import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import electronPath from "electron";

const REQUIRED_ASAR_PATHS = [
  "node_modules/pi-mcp-adapter/package.json",
  "node_modules/pi-mcp-adapter/index.ts",
  "node_modules/jiti/lib/jiti-static.mjs",
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
];

const FORBIDDEN_ASAR_PACKAGE_PREFIXES = ["@anthropic-ai/claude-agent-sdk-"];

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

      const mainEntryPath = path.join(asarPath, "out", "main", "main.js");
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
