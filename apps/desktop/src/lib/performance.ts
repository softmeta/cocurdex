import { logRendererDiagnostic } from "./diagnostics";

const PERF_LOG_PREFIX = "[perf]";
const PERF_OPT_IN_STORAGE_KEY = "cocurdex.perf";
let activeLongTaskObserver: PerformanceObserver | null = null;
let activeLongTaskTimer: ReturnType<typeof setTimeout> | null = null;

type PerfRuntimeEnv = {
  getStoredOptIn: () => string | null;
  mode: string;
};

export function resolvePerfEnabled({
  getStoredOptIn,
  mode,
}: PerfRuntimeEnv): boolean {
  if (mode === "test") {
    return false;
  }

  try {
    return getStoredOptIn() === "1";
  } catch {
    return false;
  }
}

// Resolve once: perf marks/logs run only when the user explicitly opts in via
// localStorage (`cocurdex.perf = "1"`). With no opt-in we cut every call below
// to a single boolean check — keeps streaming render hot paths free of
// diagnostic logging and JSON.stringify cost.
const PERF_ENABLED: boolean = (() => {
  if (typeof window === "undefined") {
    return false;
  }

  return resolvePerfEnabled({
    getStoredOptIn: () => window.localStorage.getItem(PERF_OPT_IN_STORAGE_KEY),
    mode: import.meta.env.MODE,
  });
})();

export function isPerfEnabled(): boolean {
  return PERF_ENABLED;
}

function getMarkName(scope: string, sessionId: string, label: string) {
  return `${scope}:${sessionId}:${label}`;
}

function getLatestPerformanceEntry(name: string) {
  return performance.getEntriesByName(name).at(-1);
}

export function logSessionSwitchPerf(
  sessionId: string,
  label: string,
  metadata?: Record<string, unknown>,
) {
  if (!PERF_ENABLED) {
    return;
  }

  logRendererDiagnostic("info", PERF_LOG_PREFIX, {
    markName: getMarkName("session-switch", sessionId, label),
    metadata: metadata ?? {},
  });
}

export function markSessionSwitch(
  sessionId: string,
  label: string,
  metadata?: Record<string, unknown>,
) {
  if (!PERF_ENABLED) {
    return;
  }

  const markName = getMarkName("session-switch", sessionId, label);

  performance.mark(markName);
  logSessionSwitchPerf(sessionId, label, metadata);
}

export function measureSessionSwitch(
  sessionId: string,
  label: string,
  startLabel: string,
  endLabel: string,
  metadata?: Record<string, unknown>,
) {
  if (!PERF_ENABLED) {
    return;
  }

  const measureName = getMarkName("session-switch", sessionId, label);
  const startMark = getMarkName("session-switch", sessionId, startLabel);
  const endMark = getMarkName("session-switch", sessionId, endLabel);
  const startEntry = getLatestPerformanceEntry(startMark);
  const endEntry = getLatestPerformanceEntry(endMark);
  const clickEntry = getLatestPerformanceEntry(
    getMarkName("session-switch", sessionId, "click"),
  );

  if (!startEntry || !endEntry) {
    return;
  }

  if (startEntry.startTime > endEntry.startTime) {
    return;
  }

  if (
    clickEntry &&
    startLabel !== "click" &&
    startEntry.startTime < clickEntry.startTime
  ) {
    return;
  }

  try {
    performance.measure(measureName, startMark, endMark);
  } catch (error) {
    logRendererDiagnostic("debug", PERF_LOG_PREFIX, {
      error: error instanceof Error ? error.message : String(error),
      event: "measure skipped",
      measureName,
    });
    return;
  }

  const entry = getLatestPerformanceEntry(measureName);

  logSessionSwitchPerf(sessionId, label, {
    durationMs: entry ? Math.round(entry.duration) : null,
    ...metadata,
  });
}

export function startSessionSwitchLongTaskObserver(
  sessionId: string,
  windowMs = 2000,
) {
  if (
    !PERF_ENABLED ||
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    return;
  }

  activeLongTaskObserver?.disconnect();
  if (activeLongTaskTimer) {
    clearTimeout(activeLongTaskTimer);
  }

  const startedAt = performance.now();
  activeLongTaskObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      logSessionSwitchPerf(sessionId, "long-task", {
        durationMs: Math.round(entry.duration),
        startOffsetMs: Math.round(entry.startTime - startedAt),
      });
    }
  });
  activeLongTaskObserver.observe({ entryTypes: ["longtask"] });
  activeLongTaskTimer = setTimeout(() => {
    activeLongTaskObserver?.disconnect();
    activeLongTaskObserver = null;
    activeLongTaskTimer = null;
  }, windowMs);
}
