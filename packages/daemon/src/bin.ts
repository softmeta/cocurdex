import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { formatErrorForLog } from "@cocurdex/shared/node";
import { configureDaemonLogging } from "./daemon-logging";
import { logDaemonDiagnostic } from "./diagnostics";
import { getConfiguredUserDataPath } from "./paths";
import { startDaemonServer } from "./wire";

const CRASH_SHUTDOWN_DEADLINE_MS = 5_000;

function startDaemonProcess() {
  const logging = configureDaemonLogging({
    userDataPath: getConfiguredUserDataPath(),
    echoToTerminal: process.stdout.isTTY === true,
  });
  const token =
    process.env.COCURDEX_DAEMON_TOKEN ?? randomBytes(32).toString("hex");
  const ownerFd = Number.parseInt(
    process.env.COCURDEX_DAEMON_OWNER_FD ?? "",
    10,
  );
  const webSocketPortValue = process.env.COCURDEX_DAEMON_WS_PORT;
  const webSocketPort =
    webSocketPortValue === undefined
      ? undefined
      : Number.parseInt(webSocketPortValue, 10);
  const runtimeFingerprint =
    process.env.COCURDEX_DAEMON_RUNTIME_FINGERPRINT ?? "source-runtime";
  let closeServer: (() => Promise<void>) | null = null;
  let forceOwnedProcessTree = false;
  let shutdownPromise: Promise<void> | null = null;
  let shutdownRequested = false;

  function terminateOwnedProcessTree() {
    if (!Number.isInteger(ownerFd)) {
      return;
    }

    if (process.platform === "win32") {
      const killer = spawn(
        "taskkill",
        ["/pid", String(process.pid), "/T", "/F"],
        {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        },
      );
      killer.unref();
      return;
    }

    try {
      process.kill(-process.pid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        logDaemonDiagnostic("error", "daemon.processGroupTerminateFailed", {
          error,
        });
      }
    }
    setTimeout(() => {
      try {
        process.kill(-process.pid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          logDaemonDiagnostic("error", "daemon.processGroupKillFailed", {
            error,
          });
        }
      }
    }, 1_000);
  }

  function requestShutdown(options: { forceProcessTree: boolean }) {
    shutdownRequested = true;
    forceOwnedProcessTree ||= options.forceProcessTree;
    if (!closeServer || shutdownPromise) {
      return;
    }

    shutdownPromise = closeServer()
      .catch((error: unknown) => {
        logDaemonDiagnostic("error", "daemon.shutdownFailed", { error });
      })
      .finally(() => {
        logDaemonDiagnostic("info", "daemon.stopped", {
          uptimeSeconds: Math.round(process.uptime()),
        });
        if (forceOwnedProcessTree) {
          terminateOwnedProcessTree();
        }
      });
  }

  process.on("SIGINT", () => requestShutdown({ forceProcessTree: false }));
  process.on("SIGTERM", () => requestShutdown({ forceProcessTree: false }));
  function crash(event: string, error: unknown) {
    logDaemonDiagnostic("error", event, { error: formatErrorForLog(error) });
    setTimeout(() => {
      terminateOwnedProcessTree();
      process.exit(1);
    }, CRASH_SHUTDOWN_DEADLINE_MS).unref();
    requestShutdown({ forceProcessTree: true });
  }

  process.on("uncaughtException", (error) => {
    crash("daemon.uncaughtException", error);
  });
  process.on("unhandledRejection", (reason) => {
    crash("daemon.unhandledRejection", reason);
  });

  if (Number.isInteger(ownerFd)) {
    const ownerPipe = createReadStream("", { autoClose: true, fd: ownerFd });
    ownerPipe.resume();
    ownerPipe.once("end", () => requestShutdown({ forceProcessTree: true }));
    ownerPipe.once("error", () => requestShutdown({ forceProcessTree: true }));
  }

  void startDaemonServer({
    logging,
    runtimeFingerprint,
    token,
    webSocketPort,
    webRoot: process.env.COCURDEX_WEB_ROOT || undefined,
    onIdleShutdown: () => process.exit(0),
  })
    .then((daemon) => {
      closeServer = daemon.close;
      logDaemonDiagnostic("info", "daemon.started", {
        arch: process.arch,
        node: process.versions.node,
        platform: process.platform,
        runtimeFingerprint,
        startupMs: Math.round(process.uptime() * 1000),
      });
      void daemon.service.skillsService.refreshManagedGlobalInstall();
      if (shutdownRequested) {
        requestShutdown({ forceProcessTree: forceOwnedProcessTree });
      }
    })
    .catch((error: unknown) => {
      logDaemonDiagnostic("error", "daemon.startFailed", {
        error: formatErrorForLog(error),
      });
      process.exit(1);
    });
}

startDaemonProcess();
