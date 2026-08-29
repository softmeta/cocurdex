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
