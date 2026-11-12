import { userInfo } from "node:os";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { DaemonBackgroundStatus } from "@cocurdex/rpc";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult } from "./parse-args";

const USAGE = "Usage: cocurdex daemon background on|off|status [--json]";

export function daemonBackgroundUsageLines() {
  return ["  cocurdex daemon background on|off|status [--json]"];
}

function describeDaemonBackground(
  status: DaemonBackgroundStatus,
  platform: NodeJS.Platform = process.platform,
) {
  if (!status.available) {
    return "Background mode is not available for this daemon (source build)";
  }
  if (!status.enabled) {
    return "Background mode is off: the daemon stops when Cocurdex quits";
  }
  if (!status.registered) {
    return "Background mode is on, but the login item is missing; run `cocurdex daemon background on` to restore it";
  }
  if (status.startsAt === "boot") {
    return "Background mode is on: the daemon keeps running after Cocurdex quits and starts when this computer boots";
  }
  const bootHint =
    platform === "linux"
      ? `run \`sudo loginctl enable-linger ${userInfo().username}\``
      : "turn on automatic login for this account";
  return `Background mode is on: the daemon keeps running after Cocurdex quits and starts when you sign in. To have it running after a restart without signing in, ${bootHint}`;
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
  console.log(describeDaemonBackground(status));
}
