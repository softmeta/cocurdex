import { type ChildProcess, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";
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
  onDiagnostic?(
    stream: "stderr" | "stdout",
    message: string,
    source?: DaemonDiagnosticSource,
  ): void;
  onError(error: Error): void;
  onExit(code: number | null, signal: NodeJS.Signals | null): void;
  runtimeFingerprint: string;
  userDataPath: string;
}

export type DaemonDiagnosticSource = "diagnostic" | "stderr";

export function parseDaemonOutputLine(
  line: string,
  stream: "stderr" | "stdout",
): { message: string; source: DaemonDiagnosticSource } | null {
  if (line.startsWith(COCURDEX_DAEMON_DIAGNOSTIC_PREFIX)) {
    return {
      message: line.slice(COCURDEX_DAEMON_DIAGNOSTIC_PREFIX.length),
      source: "diagnostic",
    };
  }

  if (stream === "stderr" && line.trim()) {
    return { message: line, source: "stderr" };
  }

  return null;
}

function captureDiagnostics(
  stream: NodeJS.ReadableStream | null,
  streamName: "stderr" | "stdout",
  onDiagnostic: SpawnOwnedDaemonProcessOptions["onDiagnostic"],
) {
  if (!stream) return;

  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    const parsed = parseDaemonOutputLine(line, streamName);
    if (!parsed?.message.trim()) {
      return;
    }

    if (parsed.source === "stderr") {
      onDiagnostic?.(streamName, parsed.message, parsed.source);
    } else {
      // Keep the existing two-argument callback shape for structured daemon
      // diagnostics; the optional source is only needed for raw stderr.
      onDiagnostic?.(streamName, parsed.message);
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
      ...process.env,
      COCURDEX_DAEMON_OWNER_FD: "3",
      COCURDEX_DAEMON_RUNTIME_FINGERPRINT: options.runtimeFingerprint,
      COCURDEX_USER_DATA_PATH: options.userDataPath,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  captureDiagnostics(child.stdout, "stdout", options.onDiagnostic);
  captureDiagnostics(child.stderr, "stderr", options.onDiagnostic);
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
  child.once("exit", (code, signal) => {
    if (child.pid) {
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
