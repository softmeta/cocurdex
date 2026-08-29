import { spawn } from "node:child_process";
import { readDaemonMetadata, requestDaemon } from "@cocurdex/daemon/client";
import { findMonorepoRoot } from "./open-desktop";

export async function withDaemon<T>(operation: () => Promise<T>) {
  try {
    await readDaemonMetadata();
  } catch {
    await startDaemon();
  }
  return operation();
}

async function startDaemon() {
  const monorepoRoot = await findMonorepoRoot();
  if (!monorepoRoot) {
    throw new Error(
      "Cocurdex is not running. Open the Cocurdex desktop app, then retry.",
    );
  }

  const child = spawn("pnpm", ["--filter", "@cocurdex/daemon", "daemon"], {
    cwd: monorepoRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    try {
      await requestDaemon("daemon.status");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for Cocurdex daemon");
}
