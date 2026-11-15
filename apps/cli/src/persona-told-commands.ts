import { requestDaemon } from "@cocurdex/daemon/client";
import { withDaemon } from "./daemon-command";
import { getRequiredFlag, type ParsedArgs, printResult } from "./parse-args";
import { findPersonaByRef } from "./persona-commands";

const LIST_USAGE = "cocurdex persona told list <persona> [--json]";
const FORGET_USAGE =
  "cocurdex persona told forget <persona> --item <text> [--json]";

export function personaToldUsageLines() {
  return [`  ${LIST_USAGE}`, `  ${FORGET_USAGE}`];
}

function printItems(items: string[], parsed: ParsedArgs) {
  if (parsed.flags.has("json")) {
    printResult(items, parsed);
    return;
  }
  process.stdout.write(
    items.length ? `${items.map((item) => `- ${item}`).join("\n")}\n` : "",
  );
}

export async function handlePersonaToldCommand(
  args: string[],
  parsed: ParsedArgs,
) {
  const [action, ref] = args;
  if ((action !== "list" && action !== "forget") || !ref) {
    throw new Error(`Usage:\n${personaToldUsageLines().join("\n")}`);
  }
  const item = action === "forget" ? getRequiredFlag(parsed, "item") : null;
  const items = await withDaemon(async () => {
    const id = (await findPersonaByRef(ref)).id;
    return item === null
      ? requestDaemon("personalAgent.told.list", { id })
      : requestDaemon("personalAgent.told.forget", { id, item });
  });
  printItems(items, parsed);
}
