import { readDaemonMetadata, requestDaemon } from "@cocurdex/daemon/client";
import type { DaemonShutdownResult } from "@cocurdex/rpc";
import { type ParsedArgs, printResult } from "./parse-args";

const STOP_TIMEOUT_MS = 20_000;

export function daemonStopUsageLines() {
  return ["  cocurdex daemon stop [--json]"];
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForExit(pid: number) {
  const startedAt = Date.now();
  while (isRunning(pid)) {
    if (Date.now() - startedAt > STOP_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for daemon ${pid} to exit`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function busyMessage(result: DaemonShutdownResult) {
  const work = result.activeWork;
  return `Daemon is busy (${work.agentTurns} agent turns, ${work.queuedInputs} queued inputs, ${work.workspaceSearches} searches, ${result.activeRequests} requests); retry when it is idle`;
}

function printNotRunning(parsed: ParsedArgs) {
  if (parsed.flags.has("json")) {
    printResult({ status: "notRunning" }, parsed);
    return;
  }
  console.log("Daemon is not running");
}

export async function handleDaemonStopCommand(parsed: ParsedArgs) {
  const metadata = await readDaemonMetadata().catch(() => null);
  if (!metadata || !isRunning(metadata.pid)) {
    printNotRunning(parsed);
    return;
  }
  const result = await requestDaemon(
    "daemon.shutdownIfIdle",
    { pid: metadata.pid, startedAt: metadata.startedAt },
    { metadata },
  );
  if (result.status === "busy") {
    throw new Error(busyMessage(result));
  }
  await waitForExit(metadata.pid);
  if (parsed.flags.has("json")) {
    printResult({ status: "stopped", pid: metadata.pid }, parsed);
    return;
  }
  console.log(`Stopped daemon ${metadata.pid}`);
}
