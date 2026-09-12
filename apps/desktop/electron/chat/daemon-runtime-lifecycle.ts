import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import { DAEMON_PROTOCOL_VERSION, type DaemonStatus } from "@cocurdex/rpc";
import type {
  DaemonRuntimeClientOptions,
  DaemonRuntimeStatus,
} from "./daemon-runtime-types";
import {
  type DaemonDiagnosticSource,
  type OwnedDaemonProcess,
  spawnOwnedDaemonProcess,
} from "./owned-daemon-process";

type StructuredDaemonDiagnostic = {
  details?: Record<string, unknown>;
  event: string;
  level: "debug" | "info" | "warn";
};

function parseStructuredDaemonDiagnostic(
  message: string,
): StructuredDaemonDiagnostic | null {
  try {
    const parsed = JSON.parse(message) as Partial<StructuredDaemonDiagnostic>;
    if (
      !parsed ||
      typeof parsed.event !== "string" ||
      !["debug", "info", "warn"].includes(parsed.level ?? "")
    ) {
      return null;
    }

    return {
      details:
        parsed.details && typeof parsed.details === "object"
          ? parsed.details
          : undefined,
      event: parsed.event,
      level: parsed.level as StructuredDaemonDiagnostic["level"],
    };
  } catch {
    return null;
  }
}

function unavailable(error: unknown) {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED";
}

function matches(status: DaemonStatus, fingerprint: string) {
  return (
    status.protocolVersion === DAEMON_PROTOCOL_VERSION &&
    status.runtimeFingerprint === fingerprint
  );
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createDaemonRuntimeLifecycle(
  options: DaemonRuntimeClientOptions,
) {
  let daemonReady: Promise<void> | null = null;
  let readySettled = true;
  let restartReady: Promise<void> | null = null;
  let ownedDaemonProcess: OwnedDaemonProcess | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  let disposed = false;
  const controller = new AbortController();
  const requestOptions = () => ({
    userDataPath: options.userDataPath,
    signal: controller.signal,
  });
  const fingerprint = async () =>
    createHash("sha256")
      .update(await readFile(options.daemonEntryPath))
      .digest("hex");
  const assertActive = () => {
    if (disposed) throw new Error("Daemon runtime client has been disposed");
  };

  function clearRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function scheduleUpdate() {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!readySettled && daemonReady) {
        scheduleUpdate();
        return;
      }
      daemonReady = null;
      void ensure().catch((error: unknown) =>
        options.logger.warn("daemon.updateDeferred", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }, 2_000);
    retryTimer.unref?.();
  }

  async function shutdownIfIdle(status: DaemonStatus) {
    assertActive();
    const result = await requestDaemon(
      "daemon.shutdownIfIdle",
      {
        pid: status.pid,
        startedAt: status.startedAt,
      },
      requestOptions(),
    );
    assertActive();
    if (result.status === "busy") return false;
    if (result.status !== "accepted")
      throw new Error("Daemon did not confirm safe shutdown");
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await delay(100);
      assertActive();
      try {
        const current = await requestDaemon("daemon.status", requestOptions());
        if (
          current.pid !== status.pid ||
          current.startedAt !== status.startedAt
        )
          return true;
      } catch (error) {
        if (!unavailable(error)) throw error;
        if (ownedDaemonProcess?.pid === status.pid) {
          const previous = ownedDaemonProcess;
          ownedDaemonProcess = null;
          await previous.shutdown();
        }
        return true;
      }
    }
    throw new Error(
      "Timed out waiting for safe daemon shutdown; existing process was preserved",
    );
  }

  async function ensureRuntime() {
    assertActive();
    const runtimeFingerprint = await fingerprint();
    assertActive();
    let status: DaemonStatus | null = null;
    try {
      status = await requestDaemon("daemon.status", requestOptions());
    } catch (error) {
      if (!unavailable(error)) throw error;
    }
    assertActive();
    if (status) {
      if (matches(status, runtimeFingerprint)) return;
      if (!(await shutdownIfIdle(status))) {
        if (status.protocolVersion !== DAEMON_PROTOCOL_VERSION) {
          throw new Error(
            "The existing daemon is busy and uses an incompatible protocol; it was preserved",
          );
        }
        options.logger.info("daemon.updateDeferred", { pid: status.pid });
        scheduleUpdate();
        return;
      }
      return ensureRuntime();
    }
    assertActive();
    startDaemonProcess(runtimeFingerprint);
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      await delay(100);
      assertActive();
      try {
        const current = await requestDaemon("daemon.status", requestOptions());
        if (matches(current, runtimeFingerprint)) return;
        throw new Error(
          "A different daemon owns the data directory; it was preserved",
        );
      } catch (error) {
        if (!unavailable(error)) throw error;
      }
    }
    throw new Error("Timed out waiting for the Cocurdex daemon");
  }

  function ensure(): Promise<void> {
    if (disposed)
      return Promise.reject(
        new Error("Daemon runtime client has been disposed"),
      );
    if (restartReady) return restartReady;
    if (!daemonReady) {
      readySettled = false;
      const attempt = ensureRuntime().then(
        () => {
          if (daemonReady === attempt) readySettled = true;
        },
        (error) => {
          if (daemonReady === attempt) {
            daemonReady = null;
            readySettled = true;
          }
          throw error;
        },
      );
      daemonReady = attempt;
    }
    return daemonReady;
  }

  function startDaemonProcess(runtimeFingerprint: string) {
    const ownedProcess = spawnOwnedDaemonProcess({
      daemonEntryPath: options.daemonEntryPath,
      onDiagnostic(
        stream,
        message,
        source: DaemonDiagnosticSource = "diagnostic",
      ) {
        if (source === "stderr") {
          options.logger.warn("daemon.stderr", { message, stream });
          return;
        }

        const diagnostic = parseStructuredDaemonDiagnostic(message);
        if (!diagnostic) {
          options.logger.info("daemon.diagnostic", { message, stream });
          return;
        }

        let log = options.logger.info;
        if (diagnostic.level === "warn") {
          log = options.logger.warn;
        } else if (diagnostic.level === "debug") {
          log = options.logger.debug;
        }
        log("daemon.diagnostic", {
          ...(diagnostic.details ? { details: diagnostic.details } : {}),
          message: diagnostic.event,
          stream,
        });
      },
      onError(error) {
        options.logger.error("daemon.spawnFailed", {
          daemonEntryPath: options.daemonEntryPath,
          error: error.message,
        });
      },
      onExit(code, signal) {
        if (ownedDaemonProcess === ownedProcess) {
          ownedDaemonProcess = null;
          if (readySettled) daemonReady = null;
        }
        options.logger.info("daemon.exited", { code, signal });
      },
      runtimeFingerprint,
      userDataPath: options.userDataPath,
    });
    ownedDaemonProcess = ownedProcess;
    options.logger.info("daemon.spawned", {
      daemonEntryPath: options.daemonEntryPath,
      pid: ownedProcess.pid,
    });
  }

  async function getStatus(): Promise<DaemonRuntimeStatus> {
    let expectedRuntimeFingerprint: string | null = null;
    try {
      expectedRuntimeFingerprint = await fingerprint();
      const status = await requestDaemon("daemon.status", requestOptions());
      return {
        running: true,
        ...status,
        expectedRuntimeFingerprint,
        matchesRuntime: matches(status, expectedRuntimeFingerprint),
        ownedByThisApp: ownedDaemonProcess?.pid === status.pid,
        error: null,
      };
    } catch (error) {
      return {
        running: false,
        pid: null,
        protocolVersion: null,
        runtimeFingerprint: null,
        expectedRuntimeFingerprint,
        socketPath: null,
        startedAt: null,
        matchesRuntime: false,
        ownedByThisApp: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    ensure,
    getStatus,
    invalidate() {
      if (readySettled) daemonReady = null;
    },
    restart(): Promise<void> {
      if (disposed)
        return Promise.reject(
          new Error("Daemon runtime client has been disposed"),
        );
      if (restartReady) return restartReady;
      clearRetry();
      const previous = daemonReady;
      const attempt = (async () => {
        await previous?.catch(() => undefined);
        assertActive();
        let status: DaemonStatus | null = null;
        try {
          status = await requestDaemon("daemon.status", requestOptions());
        } catch (error) {
          if (!unavailable(error)) throw error;
        }
        if (status && !(await shutdownIfIdle(status))) {
          throw new Error(
            "Daemon is busy; finish or stop active work before restarting",
          );
        }
        daemonReady = null;
        await ensureRuntime();
      })().finally(() => {
        if (restartReady === attempt) restartReady = null;
      });
      restartReady = attempt;
      return attempt;
    },
    async dispose() {
      disposed = true;
      clearRetry();
      controller.abort();
      await Promise.allSettled(
        [daemonReady, restartReady].filter(
          (work): work is Promise<void> => work !== null,
        ),
      );
      const owned = ownedDaemonProcess;
      ownedDaemonProcess = null;
      await owned?.shutdown();
    },
  };
}
