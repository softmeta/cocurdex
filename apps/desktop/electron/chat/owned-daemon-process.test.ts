import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseDaemonOutputLine,
  spawnOwnedDaemonProcess,
} from "./owned-daemon-process";

const processGroups: number[] = [];
const temporaryDirectories: string[] = [];

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

async function waitForDiagnostic(onDiagnostic: ReturnType<typeof vi.fn>) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (onDiagnostic.mock.calls.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for daemon diagnostic output");
}

afterEach(async () => {
  for (const processGroup of processGroups.splice(0)) {
    try {
      process.kill(-processGroup, "SIGKILL");
    } catch {
      // The process group was already removed by the owner.
    }
  }
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("spawnOwnedDaemonProcess", () => {
  it("keeps diagnostic output structured and captures stderr failures", () => {
    expect(
      parseDaemonOutputLine(
        '[CocurdexDaemonDiagnostic] {"event":"daemon.ready"}',
        "stdout",
      ),
    ).toEqual({
      message: '{"event":"daemon.ready"}',
      source: "diagnostic",
    });
    expect(parseDaemonOutputLine("ordinary stdout", "stdout")).toBeNull();
    expect(parseDaemonOutputLine("uncaught exception", "stderr")).toEqual({
      message: "uncaught exception",
      source: "stderr",
    });
  });

  it.runIf(process.platform !== "win32")(
    "kills the process group when the owner pipe closes",
    async () => {
      const userDataPath = await mkdtemp(
        path.join(os.tmpdir(), "cocurdex-owned-daemon-"),
      );
      temporaryDirectories.push(userDataPath);
      const daemonEntryPath = path.resolve(
        process.cwd(),
        "electron/chat/owned-daemon-process.fixture.cjs",
      );
      const onDiagnostic = vi.fn();
      const ownedProcess = spawnOwnedDaemonProcess({
        daemonEntryPath,
        onDiagnostic,
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
      await waitForDiagnostic(onDiagnostic);

      await ownedProcess.shutdown();
      await waitForProcessExit(grandchildPid);

      expect(isProcessRunning(ownedProcess.pid)).toBe(false);
      expect(isProcessRunning(grandchildPid)).toBe(false);
      expect(onDiagnostic).toHaveBeenCalledWith(
        "stdout",
        '{"event":"fixture.diagnostic","value":1}',
      );
    },
  );
});
