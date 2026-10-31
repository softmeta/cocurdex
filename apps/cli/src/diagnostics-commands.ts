import { requestDaemon } from "@cocurdex/daemon/client";
import type { DaemonDiagnosticsLogLevel, DaemonHealth } from "@cocurdex/rpc";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult } from "./parse-args";

const BYTES_PER_MEBIBYTE = 1024 * 1024;

export function diagnosticsUsageLines() {
  return [
    "  cocurdex daemon status [--json]",
    "  cocurdex daemon health [--json]",
    "  cocurdex diagnostics export [--json]",
    "  cocurdex diagnostics level debug|info [--json]",
  ];
}

function mebibytes(bytes: number | null) {
  return bytes === null
    ? "-"
    : `${(bytes / BYTES_PER_MEBIBYTE).toFixed(1)} MiB`;
}

export function formatDaemonHealthLines(health: DaemonHealth) {
  const work = health.activeWork;
  const loop = health.eventLoop;
  return [
    `pid            ${health.pid} (up ${health.uptimeSeconds}s, ${health.platform}-${health.arch}, node ${health.nodeVersion})`,
    `memory         rss ${mebibytes(health.memory.rssBytes)}, heap ${mebibytes(health.memory.heapUsedBytes)} / ${mebibytes(health.memory.heapTotalBytes)}`,
    `event loop     p50 ${loop.delayP50Ms} ms, p99 ${loop.delayP99Ms} ms, max ${loop.delayMaxMs} ms, utilization ${Math.round(loop.utilization * 100)}% over ${loop.windowSeconds}s`,
    `work           ${health.activeRequests} requests, ${work.agentTurns} agent turns, ${work.queuedInputs} queued inputs, ${work.workspaceSearches} searches${work.workflowActive ? ", workflow active" : ""}`,
    `runtimes       ${health.agentRuntimes} agent sessions, ${health.terminals} terminals`,
    `connections    ${health.connections.total} (${health.connections.devices} devices)`,
    `database       schema ${health.database.schemaVersion}, ${mebibytes(health.database.sizeBytes)} + wal ${mebibytes(health.database.walBytes)}`,
    `logs           ${health.logs.level}${health.logs.directory ? ` at ${health.logs.directory}` : ""}`,
  ];
}

function parseLogLevel(value: string | undefined): DaemonDiagnosticsLogLevel {
  if (value === "debug" || value === "info") {
    return value;
  }
  throw new Error("Usage: cocurdex diagnostics level debug|info");
}

export async function handleDaemonHealthCommand(parsed: ParsedArgs) {
  const health = await withDaemon(() => requestDaemon("daemon.health"));
  if (parsed.flags.has("json")) {
    printResult(health, parsed);
    return;
  }
  for (const line of formatDaemonHealthLines(health)) {
    console.log(line);
  }
}

export async function handleDiagnosticsCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
) {
  if (action === "export") {
    const result = await withDaemon(() =>
      requestDaemon("diagnostics.export", {}),
    );
    if (parsed.flags.has("json")) {
      printResult(result, parsed);
      return true;
    }
    console.log(`Exported ${result.fileCount} files to ${result.outputPath}`);
    return true;
  }
  if (action === "level") {
    const level = parseLogLevel(args[0]);
    const result = await withDaemon(() =>
      requestDaemon("diagnostics.logLevel.set", { level }),
    );
    if (parsed.flags.has("json")) {
      printResult(result, parsed);
      return true;
    }
    console.log(`Daemon log level is ${result.level}`);
    return true;
  }
  return false;
}
