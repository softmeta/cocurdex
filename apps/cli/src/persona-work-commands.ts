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
import { findPersonaByRef } from "./persona-commands";

const LIST_USAGE = "cocurdex persona work list <persona> [--json]";
const START_USAGE =
  "cocurdex persona work start <persona> --workspace <id|name> --prompt <text>|--prompt-file <path> [--title <title>] [--role <role>|--team <template>] [--worktree] [--host <paired computer>] [--issue <COC-12|id>] [--json]";
const SEND_USAGE =
  "cocurdex persona work send <persona> <session-id> <message> [--json]";
const STOP_USAGE = "cocurdex persona work stop <persona> <session-id> [--json]";

export function personaWorkUsageLines() {
  return [
    "  cocurdex persona work catalog [--host <paired computer>] [--json]",
    `  ${LIST_USAGE}`,
    `  ${START_USAGE}`,
    `  ${SEND_USAGE}`,
    `  ${STOP_USAGE}`,
  ];
}

async function personaId(ref: string | undefined, usage: string) {
  if (!ref) throw new Error(`Usage: ${usage}`);
  return (await findPersonaByRef(ref)).id;
}

async function promptFlag(parsed: ParsedArgs) {
  const file = stringFlag(parsed, "prompt-file");
  if (file) return readFile(file, "utf8");
  return getRequiredFlag(parsed, "prompt");
}

function requiredArg(value: string | undefined, usage: string) {
  if (!value) throw new Error(`Usage: ${usage}`);
  return value;
}

export async function handlePersonaWorkCommand(
  args: string[],
  parsed: ParsedArgs,
) {
  const [action, personaRef, ...rest] = args;
  if (action === "catalog") {
    printResult(
      await withDaemon(() =>
        requestDaemon("personalAgent.work.catalog", {
          host: stringFlag(parsed, "host") ?? null,
        }),
      ),
      parsed,
    );
    return;
  }
  if (action === "list") {
    const works = await withDaemon(async () =>
      requestDaemon("personalAgent.work.list", {
        personaId: await personaId(personaRef, LIST_USAGE),
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(works, parsed);
      return;
    }
    printRows(
      works.map((work) => ({
        ...work,
        host: work.host?.name ?? "",
        waitingFor: work.waitingFor ?? "",
      })),
      [
        "sessionId",
        "title",
        "host",
        "workspaceName",
        "agentType",
        "state",
        "waitingFor",
      ],
      parsed,
    );
    return;
  }
  if (action === "start") {
    const prompt = await promptFlag(parsed);
    const work = await withDaemon(async () =>
      requestDaemon("personalAgent.work.start", {
        personaId: await personaId(personaRef, START_USAGE),
        workspace: getRequiredFlag(parsed, "workspace"),
        prompt,
        title: stringFlag(parsed, "title") ?? null,
        agentRole: stringFlag(parsed, "role") ?? null,
        teamTemplate: stringFlag(parsed, "team") ?? null,
        isolateWorktree: parsed.flags.get("worktree") === true,
        host: stringFlag(parsed, "host") ?? null,
        issue: stringFlag(parsed, "issue") ?? null,
      }),
    );
    printResult(work, parsed);
    return;
  }
  if (action === "send") {
    const sessionId = requiredArg(rest[0], SEND_USAGE);
    const message = requiredArg(rest.slice(1).join(" "), SEND_USAGE);
    const work = await withDaemon(async () =>
      requestDaemon("personalAgent.work.send", {
        personaId: await personaId(personaRef, SEND_USAGE),
        sessionId,
        message,
      }),
    );
    printResult(work, parsed);
    return;
  }
  if (action === "stop") {
    const sessionId = requiredArg(rest[0], STOP_USAGE);
    const work = await withDaemon(async () =>
      requestDaemon("personalAgent.work.stop", {
        personaId: await personaId(personaRef, STOP_USAGE),
        sessionId,
      }),
    );
    printResult(work, parsed);
    return;
  }
  throw new Error(`Usage:\n${personaWorkUsageLines().join("\n")}`);
}
