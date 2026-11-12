import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readDaemonMetadata, requestDaemon } from "@cocurdex/daemon/client";
import { withoutNodeEnvProxyFlag } from "@cocurdex/shared";
import { headlessDaemonCommand } from "./headless-daemon";
import { findMonorepoRoot, launchBackgroundDaemon } from "./open-desktop";

export async function withDaemon<T>(operation: () => Promise<T>) {
  try {
    await readDaemonMetadata();
  } catch {
    await startDaemon();
  }
  return operation();
}

function spawnDetached(command: string, args: string[], cwd?: string) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    env: withoutNodeEnvProxyFlag(process.env),
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

async function startDaemon() {
  if (process.versions.electron) {
    await launchBackgroundDaemon();
    return waitForDaemon();
  }
  const headless = headlessDaemonCommand({
    cliDir: path.dirname(fileURLToPath(import.meta.url)),
    execPath: process.execPath,
    platform: process.platform,
    exists: existsSync,
  });
  if (headless) {
    const [runtime, ...args] = headless;
    spawnDetached(runtime, [...process.execArgv, ...args]);
    return waitForDaemon();
  }
  const monorepoRoot = await findMonorepoRoot();
  if (!monorepoRoot) {
    throw new Error(
      "Cocurdex is not running. Open the Cocurdex desktop app, then retry.",
    );
  }

  const daemonRoot = path.join(monorepoRoot, "packages", "daemon");
  spawnDetached(
    process.execPath,
    ["--import", "tsx", path.join("src", "bin.ts")],
    daemonRoot,
  );
  return waitForDaemon();
}

async function waitForDaemon() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    try {
      await requestDaemon("daemon.status");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for Cocurdex daemon");
}
