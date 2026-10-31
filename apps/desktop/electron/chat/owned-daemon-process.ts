import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { withoutNodeEnvProxyFlag } from "@cocurdex/shared";
import { terminateProcessTree } from "../process";

// Must outlast the daemon's own teardown: each live agent session cancels its
// turn and then waits for the agent process to exit on its own, so that the
// agent can reap the tool commands it spawned into detached process groups.
// Timing out here escalates to SIGKILL on the daemon's process group, which
// skips that handshake and leaks those commands as orphans.
const SHUTDOWN_TIMEOUT_MS = 12_000;

export interface OwnedDaemonProcess {
  pid: number | undefined;
  shutdown(): Promise<void>;
}

interface SpawnOwnedDaemonProcessOptions {
  daemonEntryPath: string;
  onOutput?(stream: DaemonOutputStream, line: string): void;
  onError(error: Error): void;
  onExit(code: number | null, signal: NodeJS.Signals | null): void;
  runtimeFingerprint: string;
  userDataPath: string;
  webRoot?: string;
}

export type DaemonOutputStream = "stderr" | "stdout";

function captureOutput(
  stream: NodeJS.ReadableStream | null,
  streamName: DaemonOutputStream,
  onOutput: SpawnOwnedDaemonProcessOptions["onOutput"],
) {
  if (!stream) return;

  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (line.trim()) {
      onOutput?.(streamName, line);
    }
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("close", handleClose);
      resolve(false);
    }, timeoutMs);
    const handleClose = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("close", handleClose);
  });
}

export function spawnOwnedDaemonProcess(
  options: SpawnOwnedDaemonProcessOptions,
): OwnedDaemonProcess {
  const child = spawn(process.execPath, [options.daemonEntryPath], {
    detached: true,
    env: {
      ...withoutNodeEnvProxyFlag(process.env),
      COCURDEX_DAEMON_OWNER_FD: "3",
      COCURDEX_DAEMON_RUNTIME_FINGERPRINT: options.runtimeFingerprint,
      COCURDEX_USER_DATA_PATH: options.userDataPath,
      COCURDEX_WEB_ROOT: options.webRoot ?? "",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  captureOutput(child.stdout, "stdout", options.onOutput);
  captureOutput(child.stderr, "stderr", options.onOutput);
  const ownerPipe = child.stdio[3];
  if (
    ownerPipe &&
    "unref" in ownerPipe &&
    typeof ownerPipe.unref === "function"
  ) {
    ownerPipe.unref();
  }
  child.unref();
  child.once("error", options.onError);
  let exitCleanupPromise: Promise<void> = Promise.resolve();
  const canReapProcessGroupAfterExit = process.platform !== "win32";
  child.once("exit", (code, signal) => {
    if (child.pid && canReapProcessGroupAfterExit) {
      exitCleanupPromise = terminateProcessTree(child.pid).catch(
        options.onError,
      );
    }
    options.onExit(code, signal);
  });
  let shutdownPromise: Promise<void> | null = null;

  return {
    pid: child.pid,
    shutdown() {
      if (!shutdownPromise) {
        shutdownPromise = (async () => {
          ownerPipe?.destroy();
          if (!ownerPipe && child.exitCode === null) {
            child.kill("SIGTERM");
          }
          const exited = await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
          if (!exited && child.pid) {
            await terminateProcessTree(child.pid);
            await waitForExit(child, SHUTDOWN_TIMEOUT_MS);
          }
          await exitCleanupPromise;
        })();
      }
      return shutdownPromise;
    },
  };
}
