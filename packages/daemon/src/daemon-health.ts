import { stat } from "node:fs/promises";
import {
  type EventLoopUtilization,
  monitorEventLoopDelay,
  performance,
} from "node:perf_hooks";
import { CURRENT_SCHEMA_VERSION } from "@cocurdex/db";
import type { DaemonActiveWork, DaemonHealth } from "@cocurdex/rpc";
import type { LogLevel } from "@cocurdex/shared";
import { logDaemonDiagnostic } from "./diagnostics";

const EVENT_LOOP_RESOLUTION_MS = 20;
const NANOSECONDS_PER_MILLISECOND = 1e6;
const DEFAULT_SAMPLE_INTERVAL_MS = 60_000;
const DEFAULT_REPORT_EVERY_SAMPLES = 5;
const DELAY_WARN_P99_MS = 250;
const DELAY_WARN_MAX_MS = 1_000;

export interface DaemonHealthSources {
  pid: number;
  startedAt: string;
  databasePath: string;
  activeRequests(): number;
  activeWork(): DaemonActiveWork;
  connections(): { total: number; devices: number };
  agentRuntimes(): number;
  terminals(): number;
  logLevel(): LogLevel;
  logDirectory: string | null;
}

export interface DaemonHealthMonitorOptions {
  sampleIntervalMs?: number;
  reportEverySamples?: number;
}

export interface DaemonHealthMonitor {
  snapshot(options?: { includePaths: boolean }): Promise<DaemonHealth>;
  stop(): void;
}

export interface EventLoopWindow {
  windowSeconds: number;
  utilization: number;
  delayP50Ms: number;
  delayP99Ms: number;
  delayMaxMs: number;
}

export function isEventLoopDelayed(window: EventLoopWindow) {
  return (
    window.delayP99Ms >= DELAY_WARN_P99_MS ||
    window.delayMaxMs >= DELAY_WARN_MAX_MS
  );
}

export function eventLoopDelayMs(
  sampleNanoseconds: number,
  resolutionMs = EVENT_LOOP_RESOLUTION_MS,
) {
  const delayMs =
    sampleNanoseconds / NANOSECONDS_PER_MILLISECOND - resolutionMs;
  return Math.max(0, Math.round(delayMs * 10) / 10);
}

async function fileSize(filePath: string) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return null;
  }
}

function memoryUsage() {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    heapTotalBytes: usage.heapTotal,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers,
  };
}

export function createDaemonHealthMonitor(
  sources: DaemonHealthSources,
  options: DaemonHealthMonitorOptions = {},
): DaemonHealthMonitor {
  const histogram = monitorEventLoopDelay({
    resolution: EVENT_LOOP_RESOLUTION_MS,
  });
  histogram.enable();
  let windowStartedAt = performance.now();
  let windowUtilization: EventLoopUtilization =
    performance.eventLoopUtilization();
  let samples = 0;

  const currentWindow = (): EventLoopWindow => ({
    windowSeconds: Math.round((performance.now() - windowStartedAt) / 100) / 10,
    utilization:
      Math.round(
        performance.eventLoopUtilization(windowUtilization).utilization * 1000,
      ) / 1000,
    delayP50Ms: eventLoopDelayMs(histogram.percentile(50)),
    delayP99Ms: eventLoopDelayMs(histogram.percentile(99)),
    delayMaxMs: eventLoopDelayMs(histogram.max),
  });

  const resetWindow = () => {
    histogram.reset();
    windowStartedAt = performance.now();
    windowUtilization = performance.eventLoopUtilization();
  };

  const counts = () => ({
    activeRequests: sources.activeRequests(),
    activeWork: sources.activeWork(),
    connections: sources.connections(),
    agentRuntimes: sources.agentRuntimes(),
    terminals: sources.terminals(),
  });

  const sample = () => {
    samples += 1;
    const eventLoop = currentWindow();
    resetWindow();
    if (isEventLoopDelayed(eventLoop)) {
      logDaemonDiagnostic("warn", "daemon.eventLoopDelayed", { ...eventLoop });
    }
    const reportEvery =
      options.reportEverySamples ?? DEFAULT_REPORT_EVERY_SAMPLES;
    if (samples % reportEvery === 0) {
      logDaemonDiagnostic("info", "daemon.health", {
        eventLoop,
        memory: memoryUsage(),
        uptimeSeconds: Math.round(process.uptime()),
        ...counts(),
      });
    }
  };

  const timer = setInterval(
    sample,
    options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS,
  );
  timer.unref();

  return {
    async snapshot(snapshotOptions = { includePaths: false }) {
      const [sizeBytes, walBytes] = await Promise.all([
        fileSize(sources.databasePath),
        fileSize(`${sources.databasePath}-wal`),
      ]);
      return {
        pid: sources.pid,
        startedAt: sources.startedAt,
        uptimeSeconds: Math.round(process.uptime()),
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        memory: memoryUsage(),
        eventLoop: currentWindow(),
        ...counts(),
        database: {
          schemaVersion: CURRENT_SCHEMA_VERSION,
          sizeBytes,
          walBytes,
        },
        logs: {
          level: sources.logLevel(),
          directory: snapshotOptions.includePaths ? sources.logDirectory : null,
        },
      };
    },
    stop() {
      clearInterval(timer);
      histogram.disable();
    },
  };
}
