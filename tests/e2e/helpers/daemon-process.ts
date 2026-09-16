import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type RequestClientOptions,
  readDaemonMetadata,
  requestDaemon,
} from "@cocurdex/daemon/client";
import type { DaemonMetadata } from "@cocurdex/rpc";

export const repoRoot = path.resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../..",
);
const daemonPackageDir = path.join(repoRoot, "packages", "daemon");
const daemonBinPath = path.join(daemonPackageDir, "src", "bin.ts");

const STARTUP_TIMEOUT_MS = 20_000;
const SHUTDOWN_TIMEOUT_MS = 20_000;

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

function waitForExit(child: ChildProcess) {
  return new Promise<number | null>((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.once("exit", (code) => resolve(code));
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
}

export async function spawnDaemon(
  options: SpawnDaemonOptions = {},
): Promise<DaemonProcess> {
  const userDataPath =
    options.userDataPath ??
    mkdtempSync(path.join(tmpdir(), "cocurdex-e2e-daemon-"));
  const token = options.token ?? "e2e-daemon-token";
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, ["--import", "tsx", daemonBinPath], {
    cwd: daemonPackageDir,
    env: {
      ...process.env,
      COCURDEX_USER_DATA_PATH: userDataPath,
      COCURDEX_DAEMON_TOKEN: token,
      COCURDEX_DAEMON_RUNTIME_FINGERPRINT: "e2e-runtime",
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
    if (child.exitCode !== null) break;
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
    child.kill("SIGKILL");
    await exit;
    const cause =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(
      `Cocurdex daemon did not become ready.\nstderr:\n${stderr()}\nlast error: ${cause}`,
    );
  }

  const stop = async () => {
    if (child.exitCode !== null) return child.exitCode;
    child.kill("SIGTERM");
    const code = await Promise.race([
      exit,
      sleep(SHUTDOWN_TIMEOUT_MS).then(() => "timeout" as const),
    ]);
    if (code === "timeout") {
      child.kill("SIGKILL");
      await exit;
      return null;
    }
    return code;
  };

  return {
    child,
    userDataPath,
    metadata,
    options: { metadata },
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
