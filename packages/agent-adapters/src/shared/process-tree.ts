import {
  type ChildProcess,
  execFile,
  type SpawnOptions,
} from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";
import crossSpawn from "cross-spawn";
import { logAdapterDiagnostic } from "../diagnostics";

const execFileAsync = promisify(execFile);

export function executableNameForLog(command: string) {
  const base = path.win32.basename(path.posix.basename(command));
  return base.replace(/\.(?:exe|cmd|bat|com)$/i, "") || "[unknown]";
}

export function processExitLogLevel(
  code: number | null,
  signal: NodeJS.Signals | null,
) {
  return code !== null && code !== 0 && signal === null ? "warn" : "info";
}

function observeProcessLifecycle(child: ChildProcess, command: string) {
  const executable = executableNameForLog(command);
  const startedAt = performance.now();
  if (child.pid === undefined) {
    logAdapterDiagnostic("warn", "process.spawnFailed", { executable });
    return;
  }
  logAdapterDiagnostic("debug", "process.spawned", {
    executable,
    pid: child.pid,
  });
  child.once("exit", (code, signal) => {
    logAdapterDiagnostic(processExitLogLevel(code, signal), "process.exited", {
      code,
      durationMs: Math.round(performance.now() - startedAt),
      executable,
      pid: child.pid,
      signal,
    });
  });
}

export function spawnCommand(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): ChildProcess {
  const child = crossSpawn(command, [...args], {
    windowsHide: true,
    ...options,
  });
  observeProcessLifecycle(child, command);
  return child;
}

export function collectDescendantPids(processTable: string, rootPid: number) {
  const childrenByParent = new Map<number, number[]>();
  for (const line of processTable.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) {
      continue;
    }
    const siblings = childrenByParent.get(ppid) ?? [];
    siblings.push(pid);
    childrenByParent.set(ppid, siblings);
  }

  const descendants: number[] = [];
  const pending = [rootPid];
  const seen = new Set(pending);
  while (pending.length > 0) {
    const parent = pending.shift() as number;
    for (const child of childrenByParent.get(parent) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        descendants.push(child);
        pending.push(child);
      }
    }
  }
  return descendants;
}

async function readPosixDescendants(pid: number) {
  try {
    const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,ppid="]);
    return collectDescendantPids(stdout, pid);
  } catch {
    return [];
  }
}

function killQuietly(pid: number) {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }
}

export async function killProcessTree(
  pid: number,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform === "win32") {
    await execFileAsync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
    }).catch(() => undefined);
    return;
  }

  const descendants = await readPosixDescendants(pid);
  killQuietly(pid);
  for (const descendant of descendants) {
    killQuietly(descendant);
  }
}

export function stopChildProcess(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
  platform: NodeJS.Platform = process.platform,
) {
  if (platform === "win32" && child.pid !== undefined) {
    void killProcessTree(child.pid, platform);
    return;
  }
  child.kill(signal);
}
