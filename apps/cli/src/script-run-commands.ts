import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export function scriptRunUsageLines() {
  return [
    "  cocurdex script-run list [--session <requester-session-id>] [--workspace <workspace-id>] [--json]",
    "  cocurdex script-run get --run <run-id> [--json]",
    "  cocurdex script-run create --session <requester-session-id> --name <name> --file <script.js>",
    "  cocurdex script-run start --run <run-id> [--max-agents <n>]",
    "  cocurdex script-run cancel --run <run-id>",
  ];
}

function maxAgentsFlag(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "max-agents");
  if (value === undefined) return undefined;
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error("--max-agents must be a positive integer");
  }
  return parsedValue;
}

export async function handleScriptRunCommand(
  action: string | undefined,
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list") {
    const runs = await withDaemon(() =>
      requestDaemon("scriptRun.list", {
        requesterSessionId: stringFlag(parsed, "session"),
        workspaceId: stringFlag(parsed, "workspace"),
      }),
    );
    printRows(
      runs,
      ["id", "name", "status", "agentCount", "maxAgents"],
      parsed,
    );
    return true;
  }

  if (action === "get") {
    const snapshot = await withDaemon(() =>
      requestDaemon("scriptRun.get", { runId: getRequiredFlag(parsed, "run") }),
    );
    if (parsed.flags.has("json")) {
      printResult(snapshot, parsed);
      return true;
    }
    printResult(snapshot.run, parsed);
    printRows(snapshot.agents, ["sessionId", "label", "status"], parsed);
    return true;
  }

  if (action === "create") {
    const script = await readFile(getRequiredFlag(parsed, "file"), "utf8");
    const run = await withDaemon(() =>
      requestDaemon("scriptRun.create", {
        requesterSessionId: getRequiredFlag(parsed, "session"),
        name: getRequiredFlag(parsed, "name"),
        script,
      }),
    );
    printResult(run, parsed);
    return true;
  }

  if (action === "start") {
    const run = await withDaemon(() =>
      requestDaemon("scriptRun.start", {
        runId: getRequiredFlag(parsed, "run"),
        maxAgents: maxAgentsFlag(parsed),
      }),
    );
    printResult(run, parsed);
    return true;
  }

  if (action === "cancel") {
    const run = await withDaemon(() =>
      requestDaemon("scriptRun.cancel", {
        runId: getRequiredFlag(parsed, "run"),
      }),
    );
    printResult(run, parsed);
    return true;
  }

  return false;
}
