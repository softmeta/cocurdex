import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { startDaemonServer } from "./wire";

const token =
  process.env.COCURDEX_DAEMON_TOKEN ?? randomBytes(32).toString("hex");
const ownerFd = Number.parseInt(process.env.COCURDEX_DAEMON_OWNER_FD ?? "", 10);
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
      console.error("Failed to terminate Cocurdex daemon process group", error);
    }
  }
  setTimeout(() => {
    try {
      process.kill(-process.pid, "SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        console.error("Failed to kill Cocurdex daemon process group", error);
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
      console.error("Failed to shut down Cocurdex daemon", error);
    })
    .finally(() => {
      if (forceOwnedProcessTree) {
        terminateOwnedProcessTree();
      }
    });
}

process.on("SIGINT", () => requestShutdown({ forceProcessTree: false }));
process.on("SIGTERM", () => requestShutdown({ forceProcessTree: false }));
process.on("uncaughtException", (error) => {
  console.error("Cocurdex daemon uncaught exception", error);
  requestShutdown({ forceProcessTree: true });
});
process.on("unhandledRejection", (reason) => {
  console.error("Cocurdex daemon unhandled rejection", reason);
  requestShutdown({ forceProcessTree: true });
});

if (Number.isInteger(ownerFd)) {
  const ownerPipe = createReadStream("", { autoClose: true, fd: ownerFd });
  ownerPipe.resume();
  ownerPipe.once("end", () => requestShutdown({ forceProcessTree: true }));
  ownerPipe.once("error", () => requestShutdown({ forceProcessTree: true }));
}

void startDaemonServer({ runtimeFingerprint, token })
  .then((daemon) => {
    closeServer = daemon.close;
    console.log("Cocurdex daemon started");
    if (shutdownRequested) {
      requestShutdown({ forceProcessTree: forceOwnedProcessTree });
    }
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Failed to start Cocurdex daemon",
    );
    process.exit(1);
  });
