import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { withWindowsGuiSubsystem } from "./pe-subsystem.mjs";

const HEADLESS_NODE_VERSION = "24.22.2";
const DOWNLOAD_TIMEOUT_MS = 120_000;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "../..");
const daemonRequire = createRequire(
  path.join(repoRoot, "packages/daemon/package.json"),
);
const cacheDir = path.join(desktopRoot, "release", ".cache", "headless-node");

const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    target: { type: "string" },
    "out-dir": { type: "string" },
    "no-archive": { type: "boolean" },
  },
});

const hostTarget = `${process.platform}-${process.arch}`;
const target = args.target ?? hostTarget;
if (target !== hostTarget) {
  throw new Error(
    `Build the ${target} archive on a ${target} host: native modules come from this host's install (${hostTarget}).`,
  );
}
const [platform, arch] = target.split("-");
const isWindows = platform === "win32";
const { version } = JSON.parse(
  await readFile(path.join(desktopRoot, "package.json"), "utf8"),
);
const outDir = path.resolve(
  desktopRoot,
  args["out-dir"] ?? path.join("release", "headless"),
);
const name = `cocurdex-headless-${target}`;
const stage = path.join(outDir, name);

function run(command, commandArgs, options = {}) {
  execFileSync(command, commandArgs, { stdio: "inherit", ...options });
}

async function download(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function verifiedNodeFile(file) {
  const base = `https://nodejs.org/dist/v${HEADLESS_NODE_VERSION}`;
  const cached = path.join(cacheDir, HEADLESS_NODE_VERSION, file);
  const sums = (await download(`${base}/SHASUMS256.txt`)).toString("utf8");
  const expected = sums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find(([, entry]) => entry === file)?.[0];
  if (!expected) throw new Error(`SHASUMS256.txt has no entry for ${file}`);
  const bytes = existsSync(cached)
    ? await readFile(cached)
    : await download(`${base}/${file}`);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expected) {
    await rm(cached, { force: true });
    throw new Error(`Checksum mismatch for ${file}`);
  }
  await mkdir(path.dirname(cached), { recursive: true });
  await writeFile(cached, bytes);
  return cached;
}

async function installNodeRuntime(runtimeDir) {
  await mkdir(runtimeDir, { recursive: true });
  if (isWindows) {
    const nodeExe = await verifiedNodeFile(`win-${arch}/node.exe`);
    const bytes = await readFile(nodeExe);
    await writeFile(path.join(runtimeDir, "node.exe"), bytes);
    await writeFile(
      path.join(runtimeDir, "cocurdex-daemon.exe"),
      withWindowsGuiSubsystem(bytes),
    );
    return;
  }
  const folder = `node-v${HEADLESS_NODE_VERSION}-${platform}-${arch}`;
  const tarball = await verifiedNodeFile(`${folder}.tar.gz`);
  const extractDir = await mkdtemp(path.join(cacheDir, "extract-"));
  try {
    run("tar", ["-xzf", tarball, "-C", extractDir, `${folder}/bin/node`]);
    await cp(
      path.join(extractDir, folder, "bin", "node"),
      path.join(runtimeDir, "node"),
    );
    await chmod(path.join(runtimeDir, "node"), 0o755);
  } finally {
    await rm(extractDir, { force: true, recursive: true });
  }
}

function packageDir(request, from = daemonRequire) {
  for (const modulesDir of from.resolve.paths(request) ?? []) {
    const candidate = path.join(modulesDir, ...request.split("/"));
    if (existsSync(path.join(candidate, "package.json"))) {
      return realpathSync(candidate);
    }
  }
  throw new Error(`Cannot find package ${request}`);
}

function matchesTarget(packageName) {
  const suffix = packageName.split("/").pop() ?? "";
  return suffix.includes(`${platform}-${arch}`);
}

async function copyPackage(source, modulesDir, packageName, filter) {
  await cp(source, path.join(modulesDir, ...packageName.split("/")), {
    recursive: true,
    dereference: true,
    filter,
  });
}

async function installNativeModules(modulesDir) {
  const keyringDir = packageDir("@napi-rs/keyring");
  await copyPackage(keyringDir, modulesDir, "@napi-rs/keyring");
  const keyringRequire = createRequire(path.join(keyringDir, "package.json"));
  const keyringPackage = JSON.parse(
    await readFile(path.join(keyringDir, "package.json"), "utf8"),
  );
  const bindings = Object.keys(keyringPackage.optionalDependencies ?? {})
    .filter(matchesTarget)
    .filter((binding) => {
      try {
        packageDir(binding, keyringRequire);
        return true;
      } catch {
        return false;
      }
    });
  if (bindings.length === 0) {
    throw new Error(`No @napi-rs/keyring binding is installed for ${target}`);
  }
  for (const binding of bindings) {
    await copyPackage(packageDir(binding, keyringRequire), modulesDir, binding);
  }

  const ptyDir = packageDir("node-pty");
  const prebuild = path.join(ptyDir, "prebuilds", target);
  const compiled = path.join(ptyDir, "build", "Release");
  if (!existsSync(prebuild) && !existsSync(compiled)) {
    throw new Error(
      `node-pty has neither a prebuild nor a build for ${target}`,
    );
  }
  await copyPackage(ptyDir, modulesDir, "node-pty", (source) => {
    const relative = path.relative(ptyDir, source).split(path.sep);
    if (relative[0] === "prebuilds" && relative[1]) {
      return relative[1] === target;
    }
    return !["src", "deps", "scripts", "third_party", "node_modules"].includes(
      relative[0],
    );
  });

  await copyPackage(packageDir("font-list"), modulesDir, "font-list");

  const ripgrepRequire = createRequire(
    path.join(packageDir("@vscode/ripgrep"), "package.json"),
  );
  const ripgrep = `@vscode/ripgrep-${platform}-${arch}`;
  await copyPackage(packageDir(ripgrep, ripgrepRequire), modulesDir, ripgrep);
}

function posixLauncher() {
  return `#!/bin/sh
set -eu
SOURCE="$0"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  LINK="$(readlink "$SOURCE")"
  case "$LINK" in
    /*) SOURCE="$LINK" ;;
    *) SOURCE="$DIR/$LINK" ;;
  esac
done
ROOT="$(cd -P "$(dirname "$SOURCE")/.." && pwd)"
unset NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE ELECTRON_RUN_AS_NODE
exec "$ROOT/runtime/node" --disable-warning=ExperimentalWarning "$ROOT/lib/cli.mjs" "$@"
`;
}

function windowsLauncher() {
  return [
    "@echo off",
    "setlocal EnableExtensions",
    'set "ROOT=%~dp0.."',
    'set "NODE_OPTIONS="',
    'set "NODE_REPL_EXTERNAL_MODULE="',
    'set "ELECTRON_RUN_AS_NODE="',
    '"%ROOT%\\runtime\\node.exe" --disable-warning=ExperimentalWarning "%ROOT%\\lib\\cli.mjs" %*',
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

async function installLaunchers(binDir) {
  await mkdir(binDir, { recursive: true });
  if (isWindows) {
    await writeFile(path.join(binDir, "cocurdex.cmd"), windowsLauncher());
    return;
  }
  const launcher = path.join(binDir, "cocurdex");
  await writeFile(launcher, posixLauncher());
  await chmod(launcher, 0o755);
}

async function archive() {
  const file = path.join(outDir, `${name}${isWindows ? ".zip" : ".tar.gz"}`);
  await rm(file, { force: true });
  if (isWindows) {
    // Git for Windows puts GNU tar on PATH, which cannot write zip archives.
    const systemTar = path.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "tar.exe",
    );
    run(systemTar, ["-a", "-cf", file, name], { cwd: outDir });
  } else {
    run("tar", ["-czf", file, name], { cwd: outDir });
  }
  run(process.execPath, [
    path.join(__dirname, "write-artifact-sha256.mjs"),
    file,
  ]);
  return file;
}

const webRoot = path.join(desktopRoot, "out", "renderer");
if (!existsSync(path.join(webRoot, "index.html"))) {
  throw new Error(
    "Missing out/renderer: run `pnpm --filter @cocurdex/desktop build` first",
  );
}

await rm(stage, { force: true, recursive: true });
const libDir = path.join(stage, "lib");
run(process.execPath, [
  path.join(__dirname, "build-cli.mjs"),
  "--out-dir",
  libDir,
]);
for (const electronLauncher of ["cocurdex", "cocurdex.cmd"]) {
  await rm(path.join(libDir, electronLauncher), { force: true });
}
await cp(
  path.join(desktopRoot, "resources", "skills"),
  path.join(stage, "skills"),
  { recursive: true },
);
await cp(webRoot, path.join(stage, "web"), { recursive: true });
run(process.execPath, [
  path.join(__dirname, "ensure-fd.mjs"),
  "--target",
  target,
]);
await cp(
  path.join(desktopRoot, "vendor", "fd", target),
  path.join(stage, "vendor", "fd", target),
  { recursive: true },
);
await installNodeRuntime(path.join(stage, "runtime"));
await installNativeModules(path.join(libDir, "node_modules"));
await installLaunchers(path.join(stage, "bin"));
await writeFile(
  path.join(stage, "VERSION"),
  `${version}\nnode ${HEADLESS_NODE_VERSION}\n`,
);

const entries = await readdir(stage);
console.info(`[build-headless] staged ${stage}: ${entries.join(", ")}`);
if (!args["no-archive"]) {
  console.info(`[build-headless] wrote ${await archive()}`);
}
