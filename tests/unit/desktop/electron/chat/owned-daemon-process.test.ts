import { readFile } from "node:fs/promises";
import path from "node:path";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { spawnOwnedDaemonProcess } from "@desktop/electron/chat/owned-daemon-process";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

const processGroups: number[] = [];

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForGrandchildPid(userDataPath: string) {
  const pidPath = path.join(userDataPath, "grandchild.pid");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return Number.parseInt(await readFile(pidPath, "utf8"), 10);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("Timed out waiting for grandchild process");
}

async function waitForProcessExit(pid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isProcessRunning(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for process ${pid} to exit`);
}

async function waitForOutput(onOutput: ReturnType<typeof vi.fn>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (onOutput.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for daemon output");
}

afterEach(async () => {
  for (const processGroup of processGroups.splice(0)) {
    try {
      process.kill(-processGroup, "SIGKILL");
    } catch {
      // The process group was already removed by the owner.
    }
  }
  await tempDirs.cleanup();
});

describe("spawnOwnedDaemonProcess", () => {
  it.runIf(process.platform !== "win32")(
    "kills the process group when the owner pipe closes",
    async () => {
      const userDataPath = await tempDirs.create("cocurdex-owned-daemon-");
      const daemonEntryPath = path.join(
        import.meta.dirname,
        "owned-daemon-process.fixture.cjs",
      );
      const onOutput = vi.fn();
      const ownedProcess = spawnOwnedDaemonProcess({
        daemonEntryPath,
        onOutput,
        onError: vi.fn(),
        onExit: vi.fn(),
        runtimeFingerprint: "test-runtime",
        userDataPath,
      });
      if (!ownedProcess.pid) {
        throw new Error("Owned daemon process has no pid");
      }
      processGroups.push(ownedProcess.pid);
      const grandchildPid = await waitForGrandchildPid(userDataPath);
      await waitForOutput(onOutput);

      await ownedProcess.shutdown();
      await waitForProcessExit(grandchildPid);

      expect(isProcessRunning(ownedProcess.pid)).toBe(false);
      expect(isProcessRunning(grandchildPid)).toBe(false);
      expect(onOutput).toHaveBeenCalledWith("stdout", "fixture output");
    },
  );
});
