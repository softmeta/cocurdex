import { requestDaemon } from "@cocurdex/daemon/client";
import type { DaemonBackgroundStatus } from "@cocurdex/rpc";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult } from "./parse-args";

const USAGE = "Usage: cocurdex daemon background on|off|status [--json]";

export function daemonBackgroundUsageLines() {
  return ["  cocurdex daemon background on|off|status [--json]"];
}

function describe(status: DaemonBackgroundStatus) {
  if (!status.available) {
    return "Background mode is not available for this daemon (source build)";
  }
  if (!status.enabled) {
    return "Background mode is off: the daemon stops when Cocurdex quits";
  }
  if (!status.registered) {
    return "Background mode is on, but the login item is missing; run `cocurdex daemon background on` to restore it";
  }
  return "Background mode is on: the daemon keeps running after Cocurdex quits and starts at login";
}

function backgroundRequest(mode: string | undefined) {
  if (mode === "on" || mode === "off") {
    const enabled = mode === "on";
    return () => requestDaemon("daemon.background.set", { enabled });
  }
  if (mode === undefined || mode === "status") {
    return () => requestDaemon("daemon.background.get");
  }
  throw new Error(USAGE);
}

export async function handleDaemonBackgroundCommand(
  args: string[],
  parsed: ParsedArgs,
) {
  const status = await withDaemon(backgroundRequest(args[0]));
  if (parsed.flags.has("json")) {
    printResult(status, parsed);
    return;
  }
  console.log(describe(status));
}
