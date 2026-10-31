import { type ChildProcess, spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { killProcessTree } from "@cocurdex/agent-adapters";
import {
  type RequestClientOptions,
  readDaemonMetadata,
  requestDaemon,
} from "@cocurdex/daemon/client";
import { getDaemonLogDirectory } from "@cocurdex/daemon/paths";
import type { DaemonMetadata } from "@cocurdex/rpc";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";

const tempDirs = createTempDirs();
const activeStops = new Set<() => Promise<number | null>>();
export async function disposeTestDaemons() {
  await Promise.all([...activeStops].map((stop) => stop()));
  await tempDirs.cleanup();
}

export const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../..",
);
const daemonPackageDir = path.join(repoRoot, "packages", "daemon");
const daemonBinPath = path.join(daemonPackageDir, "src", "bin.ts");
export const bundledDaemonPath = path.join(
  repoRoot,
  "apps",
  "desktop",
  "resources",
  "cli",
  "daemon.cjs",
);

const STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 20_000;
const LOG_TAIL_LINES = 40;

export async function daemonLogTail(
  userDataPath: string,
  lines = LOG_TAIL_LINES,
) {
  const logPath = path.join(getDaemonLogDirectory(userDataPath), "daemon.log");
  const text = await readFile(logPath, "utf8").catch(() => "(no daemon log)");
  return text.split(/\r?\n/).slice(-lines).join("\n");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(
  condition: () => boolean,
  timeoutMs = 5_000,
  intervalMs = 25,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(intervalMs);
  }
  throw new Error("Timed out waiting for condition");
}

export async function waitForDaemonStatus(
  metadata: DaemonMetadata,
  timeoutMs = STARTUP_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await requestDaemon("daemon.status", { metadata });
    } catch (error) {
      lastError = error;
      await sleep(80);
    }
  }
  const cause =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Cocurdex daemon did not answer daemon.status: ${cause}`);
}

export async function requestDaemonShutdown(metadata: DaemonMetadata) {
  try {
    const result = await requestDaemon(
      "daemon.shutdownIfIdle",
      { pid: metadata.pid, startedAt: metadata.startedAt },
      { metadata },
    );
    return result.status === "accepted";
  } catch {
    return false;
  }
}

function waitForExit(child: ChildProcess) {
  return new Promise<number | null>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code));
    child.once("error", () => resolve(null));
  });
}

export interface DaemonProcess {
  readonly child: ChildProcess;
  readonly userDataPath: string;
  readonly metadata: DaemonMetadata;
  readonly options: RequestClientOptions;
  readonly exit: Promise<number | null>;
  stderr(): string;
  stop(): Promise<number | null>;
  dispose(): Promise<void>;
}

export interface SpawnDaemonOptions {
  userDataPath?: string;
  token?: string;
  nodeArgs?: string[];
  entry?: "source" | "bundled";
  env?: NodeJS.ProcessEnv;
}

function daemonCommand(options: SpawnDaemonOptions) {
  const nodeArgs = options.nodeArgs ?? [];
  if (options.entry === "bundled") {
    return {
      args: [...nodeArgs, bundledDaemonPath],
      cwd: path.dirname(bundledDaemonPath),
    };
  }
  return {
    args: [...nodeArgs, "--import", "tsx", daemonBinPath],
    cwd: daemonPackageDir,
  };
}

export async function spawnDaemon(
  options: SpawnDaemonOptions = {},
): Promise<DaemonProcess> {
  const userDataPath = options.userDataPath ?? tempDirs.createSync("cocu-e2e-");
  const token = options.token ?? "e2e-daemon-token";
  const stderrChunks: Buffer[] = [];
  const command = daemonCommand(options);
  const child = spawn(process.execPath, command.args, {
    cwd: command.cwd,
    env: {
      ...process.env,
      ...options.env,
      COCURDEX_USER_DATA_PATH: userDataPath,
      COCURDEX_DAEMON_TOKEN: token,
      COCURDEX_DAEMON_RUNTIME_FINGERPRINT: "e2e-runtime",
      COCURDEX_DISABLE_MEMORY_AUTO_START: "1",
      NO_COLOR: "1",
      TZ: "UTC",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
  child.stdout?.resume();
  const exit = waitForExit(child);
  const stderr = () => Buffer.concat(stderrChunks).toString("utf8");

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let metadata: DaemonMetadata | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const candidate = await readDaemonMetadata(userDataPath);
      if (candidate.pid !== child.pid) {
        throw new Error("Stale daemon metadata from a previous process");
      }
      await requestDaemon("daemon.status", { metadata: candidate });
      metadata = candidate;
      break;
    } catch (error) {
      lastError = error;
      await sleep(80);
    }
  }
  if (!metadata) {
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      await killProcessTree(child.pid);
    }
    await exit;
    const logTail = await daemonLogTail(userDataPath);
    if (!options.userDataPath) {
      await rm(userDataPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
    const cause =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Cocurdex daemon did not become ready in ${STARTUP_TIMEOUT_MS} ms.\nstderr:\n${stderr()}\nlast error: ${cause}\ndaemon log:\n${logTail}`,
    );
  }

  const readyMetadata = metadata;
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      activeStops.delete(stop);
      return child.exitCode;
    }
    if (!(await requestDaemonShutdown(readyMetadata))) {
      if (process.platform === "win32" && child.pid) {
        await killProcessTree(child.pid);
      } else {
        child.kill("SIGTERM");
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const code = await Promise.race([
      exit,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), SHUTDOWN_TIMEOUT_MS);
      }),
    ]).finally(() => clearTimeout(timer));
    if (code === "timeout") {
      if (child.pid) await killProcessTree(child.pid);
      await exit;
      activeStops.delete(stop);
      return null;
    }
    activeStops.delete(stop);
    return code;
  };
  activeStops.add(stop);

  return {
    child,
    userDataPath,
    metadata: readyMetadata,
    options: { metadata: readyMetadata },
    exit,
    stderr,
    stop,
    dispose: async () => {
      await stop();
      await rm(userDataPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    },
  };
}
