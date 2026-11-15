import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { findPersonaByRef } from "./persona-commands";

const LIST_USAGE = "cocurdex persona follow-up list <persona> [--all] [--json]";
const SET_USAGE =
  "cocurdex persona follow-up set <persona> --note <text> (--at <ISO time with offset>|--in <minutes>) [--json]";
const CANCEL_USAGE =
  "cocurdex persona follow-up cancel <follow-up-id> [--json]";

export function personaFollowUpUsageLines() {
  return [`  ${LIST_USAGE}`, `  ${SET_USAGE}`, `  ${CANCEL_USAGE}`];
}

function requiredArg(value: string | undefined, usage: string) {
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

function dueAtFlag(parsed: ParsedArgs) {
  const at = stringFlag(parsed, "at");
  const inMinutes = stringFlag(parsed, "in");
  if (Boolean(at) === Boolean(inMinutes)) {
    throw new Error(`Pass exactly one of --at or --in.\nUsage: ${SET_USAGE}`);
  }
  if (at) return at;
  const minutes = Number(inMinutes);
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error("--in takes a whole number of minutes, at least 1.");
  }
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export async function handlePersonaFollowUpCommand(
  args: string[],
  parsed: ParsedArgs,
) {
  const [action, ref] = args;
  if (action === "list") {
    const followUps = await withDaemon(async () =>
      requestDaemon("followUp.list", {
        agentId: (await findPersonaByRef(requiredArg(ref, LIST_USAGE))).id,
        status: parsed.flags.get("all") === true ? null : "pending",
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(followUps, parsed);
      return;
    }
    printRows(followUps, ["id", "dueAt", "status", "note"], parsed);
    return;
  }
  if (action === "set") {
    const note = getRequiredFlag(parsed, "note");
    const dueAt = dueAtFlag(parsed);
    const followUp = await withDaemon(async () =>
      requestDaemon("followUp.create", {
        agentId: (await findPersonaByRef(requiredArg(ref, SET_USAGE))).id,
        note,
        dueAt,
      }),
    );
    printResult(followUp, parsed);
    return;
  }
  if (action === "cancel") {
    const id = requiredArg(ref, CANCEL_USAGE);
    printResult(
      await withDaemon(() => requestDaemon("followUp.cancel", { id })),
      parsed,
    );
    return;
  }
  throw new Error(`Usage:\n${personaFollowUpUsageLines().join("\n")}`);
}
