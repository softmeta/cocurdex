import fs from "node:fs/promises";
import path from "node:path";
import { crashReporter } from "electron";

// Minimal surface of Electron's crashReporter we depend on, so the starter can
// be unit-tested without booting Electron.
export interface CrashReporterApi {
  start(options: Electron.CrashReporterStartOptions): void;
}

export type ProcessGoneReason =
  | "clean-exit"
  | "abnormal-exit"
  | "killed"
  | "crashed"
  | "oom"
  | "launch-failed"
  | "integrity-failure"
  | "memory-eviction";

export interface ProcessGoneSummary {
  reason: ProcessGoneReason;
  exitCode: number;
  fatal: boolean;
}

// Reasons that indicate the process died unexpectedly and a native minidump is
// worth investigating. `clean-exit`, `killed` and `memory-eviction` are routine
// lifecycle events (intentional shutdown / OS memory reclaim), not crashes.
const FATAL_REASONS = new Set<ProcessGoneReason>([
  "abnormal-exit",
  "crashed",
  "oom",
  "launch-failed",
  "integrity-failure",
]);

export function summarizeProcessGone(details: {
  reason: ProcessGoneReason;
  exitCode: number;
}): ProcessGoneSummary {
  return {
    exitCode: details.exitCode,
    fatal: FATAL_REASONS.has(details.reason),
    reason: details.reason,
  };
}

// Start native crash capture as early as possible so renderer/GPU/utility and
// main-process crashes — including ones that bypass the V8 `uncaughtException`
// handler, such as the intermittent crash on toggling DevTools — leave a
// minidump under `app.getPath("crashDumps")`. Reports stay on disk;
// uploadToServer is disabled because there is no collection endpoint.
export function startCrashReporter(
  api: CrashReporterApi = crashReporter,
): void {
  api.start({
    ignoreSystemCrashHandler: false,
    uploadToServer: false,
  });
}

export interface CrashDumpDescriptor {
  id: string;
  modifiedAt: string;
}

const CRASH_DUMP_LIST_LIMIT = 20;

async function listDumpsIn(directory: string, depth = 0) {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const dumps: CrashDumpDescriptor[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".dmp")) {
      try {
        const stats = await fs.stat(path.join(directory, entry.name));
        dumps.push({
          id: entry.name.replace(/\.dmp$/, ""),
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // Skip dumps that vanish mid-scan.
      }
    } else if (entry.isDirectory() && depth === 0) {
      dumps.push(
        ...(await listDumpsIn(path.join(directory, entry.name), depth + 1)),
      );
    }
  }
  return dumps;
}

// Inventory only: dump files themselves stay out of diagnostics exports because
// minidumps contain raw process memory.
export async function listCrashDumps(
  directory: string,
): Promise<CrashDumpDescriptor[]> {
  const dumps = await listDumpsIn(directory);
  return dumps
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, CRASH_DUMP_LIST_LIMIT);
}
