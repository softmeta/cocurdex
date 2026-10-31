import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

const DESKTOP_DIR = fileURLToPath(
  new URL("../../../apps/desktop/", import.meta.url),
);
const REPO_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const BUNDLED_DAEMON = path.join(DESKTOP_DIR, "resources", "cli", "daemon.cjs");
const DAEMON_SOURCE_ROOTS = ["packages", path.join("apps", "cli")];
const APP_SOURCE_ROOTS = [
  "packages",
  path.join("apps", "desktop", "src"),
  path.join("apps", "desktop", "electron"),
];
const BUILT_MAIN = path.join(DESKTOP_DIR, "out", "main", "main.js");
const BUILT_RENDERER = path.join(DESKTOP_DIR, "out", "renderer", "index.html");
const BUILT_RENDERER_URL = "app://renderer/index.html";
const RENDERER_MODE_ENV = "COCURDEX_SCENARIO_RENDERER";
const BUILD_HEAP_MB = 6144;
const BUILD_OUTPUT_LIMIT = 64 * 1024 * 1024;
const RENDERER_URL_PATTERN = /Local:\s+(http:\/\/localhost:\d+\/)/;
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
const STOP_TIMEOUT_MS = 10_000;
const REMOVE_RETRIES = 10;
const REMOVE_RETRY_DELAY_MS = 100;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export function rendererMode() {
  return process.env[RENDERER_MODE_ENV] === "built" ? "built" : "dev";
}

function sourceDirsOf(root) {
  const rootDir = path.join(REPO_DIR, root);
  if (root === "packages") {
    return readdirSync(rootDir).map((name) => path.join(rootDir, name, "src"));
  }
  return root === path.join("apps", "cli")
    ? [path.join(rootDir, "src")]
    : [rootDir];
}

function newestSourceMtime(roots) {
  let newest = 0;
  for (const root of roots) {
    const sourceDirs = sourceDirsOf(root);
    for (const dir of sourceDirs.filter((candidate) => existsSync(candidate))) {
      for (const file of readdirSync(dir, { recursive: true })) {
        newest = Math.max(newest, statSync(path.join(dir, file)).mtimeMs);
      }
    }
  }
  return newest;
}

let bundledDaemonCheck = null;

function ensureBundledDaemon() {
  bundledDaemonCheck ??= Promise.resolve().then(() => {
    const builtAt = existsSync(BUNDLED_DAEMON)
      ? statSync(BUNDLED_DAEMON).mtimeMs
      : 0;
    if (builtAt >= newestSourceMtime(DAEMON_SOURCE_ROOTS)) return;
    const result = spawnSync(
      process.execPath,
      [path.join(DESKTOP_DIR, "scripts", "build-cli.mjs")],
      { cwd: DESKTOP_DIR, stdio: ["ignore", "ignore", "inherit"] },
    );
    if (result.status !== 0) {
      throw new Error(`Bundled daemon rebuild failed (${result.status})`);
    }
  });
  return bundledDaemonCheck;
}

let builtAppCheck = null;

function ensureBuiltApp() {
  builtAppCheck ??= Promise.resolve().then(() => {
    const builtAt =
      existsSync(BUILT_RENDERER) && existsSync(BUILT_MAIN)
        ? statSync(BUILT_RENDERER).mtimeMs
        : 0;
    if (builtAt >= newestSourceMtime(APP_SOURCE_ROOTS)) return;
    const result = spawnSync(process.execPath, [electronViteBin(), "build"], {
      cwd: DESKTOP_DIR,
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${BUILD_HEAP_MB}`,
      },
      encoding: "utf8",
      maxBuffer: BUILD_OUTPUT_LIMIT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(
        `Desktop build failed (${result.status}): ${result.stderr || result.stdout}`,
      );
    }
  });
  return builtAppCheck;
}

function electronExecutable() {
  const packageDir = path.join(DESKTOP_DIR, "node_modules", "electron");
  const relative = readFileSync(path.join(packageDir, "path.txt"), "utf8");
  return path.join(packageDir, "dist", relative.trim());
}

function electronViteBin() {
  const require = createRequire(path.join(DESKTOP_DIR, "package.json"));
  const manifestPath = require.resolve("electron-vite/package.json");
  const manifest = require(manifestPath);
  const bin =
    typeof manifest.bin === "string"
      ? manifest.bin
      : manifest.bin["electron-vite"];
  return path.join(path.dirname(manifestPath), bin);
}

function descendantPids(rootPid) {
  const result = spawnSync("ps", ["-axo", "pid=,ppid="], {
    encoding: "utf8",
  });
  const children = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!pid) continue;
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const found = [];
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    for (const child of children.get(pid) ?? []) {
      found.push(child);
      queue.push(child);
    }
  }
  return found;
}

function processKind(command) {
  const type = /--type=([\w-]+)/.exec(command)?.[1];
  if (type === "utility") {
    return /--utility-sub-type=([\w.]+)/.exec(command)?.[1] ?? type;
  }
  if (type) return type;
  if (command.includes("daemon.cjs")) return "daemon";
  if (/electron-vite|vite/.test(command)) return "vite";
  if (/electron/i.test(command)) return "browser";
  return "other";
}

export function processTreeMemory(rootPid) {
  if (process.platform === "win32") return null;
  const pids = new Set([rootPid, ...descendantPids(rootPid)]);
  const result = spawnSync("ps", ["-axo", "pid=,rss=,args="], {
    encoding: "utf8",
  });
  const byKind = {};
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match || !pids.has(Number(match[1]))) continue;
    const kind = processKind(match[3]);
    const entry = byKind[kind] ?? { count: 0, rssMb: 0 };
    byKind[kind] = {
      count: entry.count + 1,
      rssMb: entry.rssMb + Math.round(Number(match[2]) / 1024),
    };
  }
  const totalMb = Object.values(byKind).reduce(
    (total, entry) => total + entry.rssMb,
    0,
  );
  return { totalMb, byKind };
}

function treePids(rootPid) {
  if (process.platform === "win32") return [rootPid];
  return [rootPid, ...descendantPids(rootPid)];
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pids) {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (pids.some(isRunning) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  for (const pid of pids.filter(isRunning)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}

export async function stopProcessTree(rootPid) {
  const tree = treePids(rootPid);
  killTree(rootPid);
  await waitForExit(tree);
}

function killTree(rootPid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(rootPid), "/T", "/F"]);
    return;
  }
  for (const pid of [rootPid, ...descendantPids(rootPid)].reverse()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

async function waitForRendererUrl(child, logPath) {
  let exitCode = null;
  child.once("exit", (code) => {
    exitCode = code ?? -1;
  });
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const log = stripVTControlCharacters(await readFile(logPath, "utf8"));
    const match = RENDERER_URL_PATTERN.exec(log);
    if (match) return match[1];
    if (exitCode !== null) {
      throw new Error(`electron-vite dev exited early with code ${exitCode}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the renderer dev server");
}

async function waitForTarget(port, url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      if (targets.some((target) => target.url === url)) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for CDP target ${url} on ${port}`);
}

export function removeTempDir(dirPath) {
  return rm(dirPath, {
    recursive: true,
    force: true,
    maxRetries: REMOVE_RETRIES,
    retryDelay: REMOVE_RETRY_DELAY_MS,
  });
}

export async function stopIsolatedInstance(pid, userDataPath) {
  await stopProcessTree(pid);
  await removeTempDir(userDataPath);
}

function spawnApp(mode, env, logFd) {
  const stdio = ["ignore", logFd, logFd];
  if (mode === "built") {
    const { ELECTRON_RENDERER_URL: _devUrl, ...builtEnv } = env;
    return spawn(electronExecutable(), [BUILT_MAIN], {
      cwd: DESKTOP_DIR,
      env: builtEnv,
      stdio,
    });
  }
  return spawn(process.execPath, [electronViteBin(), "dev"], {
    cwd: DESKTOP_DIR,
    env,
    stdio,
  });
}

export async function launchIsolatedInstance({ prepareUserData } = {}) {
  const mode = rendererMode();
  await ensureBundledDaemon();
  if (mode === "built") await ensureBuiltApp();
  const port = await freePort();
  const userDataPath = await mkdtemp(path.join(os.tmpdir(), "cocu-"));
  try {
    await prepareUserData?.(userDataPath);
  } catch (error) {
    await rm(userDataPath, {
      recursive: true,
      force: true,
      maxRetries: REMOVE_RETRIES,
      retryDelay: REMOVE_RETRY_DELAY_MS,
    });
    throw error;
  }
  const logPath = `${userDataPath}.log`;
  const logFd = openSync(logPath, "a");
  const child = spawnApp(
    mode,
    {
      ...process.env,
      COCURDEX_USER_DATA_PATH: userDataPath,
      COCURDEX_REMOTE_DEBUGGING_PORT: String(port),
      COCURDEX_DISABLE_MEMORY_AUTO_START: "1",
    },
    logFd,
  );
  closeSync(logFd);
  const stop = async ({ keepLog = false } = {}) => {
    const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
    const tree = treePids(child.pid);
    killTree(child.pid);
    await waitForExit(tree);
    if (keepLog && artifacts) {
      await mkdir(artifacts, { recursive: true });
      await copyFile(logPath, path.join(artifacts, path.basename(logPath)));
      const appLogs = path.join(userDataPath, "logs");
      if (existsSync(appLogs)) {
        await cp(
          appLogs,
          path.join(artifacts, `${path.basename(userDataPath)}-logs`),
          { recursive: true },
        );
      }
    }
    await removeTempDir(userDataPath);
    if (!keepLog) await rm(logPath, { force: true });
  };
  try {
    const url =
      mode === "built"
        ? BUILT_RENDERER_URL
        : await waitForRendererUrl(child, logPath);
    await waitForTarget(port, url);
    return {
      pid: child.pid,
      port: String(port),
      url,
      userDataPath,
      logPath,
      stop,
    };
  } catch (error) {
    await stop({ keepLog: true });
    throw new Error(
      `${error instanceof Error ? error.message : error} (log: ${logPath})`,
    );
  }
}
