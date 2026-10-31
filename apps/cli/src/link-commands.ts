import { requestDaemon } from "@cocurdex/daemon/client";
import { type EntityRef, entityUri, parseEntityRef } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, printRows } from "./parse-args";

const USAGE = {
  list: "cocurdex link list <ref>",
  add: "cocurdex link add <ref> <ref>",
  remove: "cocurdex link remove <ref> <ref>",
} as const;

const REF_HINT =
  "A ref is <kind>:<id> or cocurdex://<kind>/<id>, with kind session, note, issue, or deck (issues also accept their identifier, e.g. issue:ACME-12)";

function readRef(value: string | undefined, action: keyof typeof USAGE) {
  if (!value) {
    throw new Error(`Usage: ${USAGE[action]}\n${REF_HINT}`);
  }
  const ref = parseEntityRef(value);
  if (!ref) {
    throw new Error(`Invalid ref: ${value}\n${REF_HINT}`);
  }
  return ref;
}

function readPair(
  args: string[],
  action: "add" | "remove",
): { source: EntityRef; target: EntityRef } {
  return {
    source: readRef(args[0], action),
    target: readRef(args[1], action),
  };
}

export async function handleLinkCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list") {
    const ref = readRef(args[0], "list");
    const links = await withDaemon(() => requestDaemon("link.list", { ref }));
    printRows(
      links.map((link) => ({
        relation: link.relation,
        kind: link.target.kind,
        id: link.target.id,
        detail: link.detail ?? "",
        title: link.title,
        uri: entityUri(link.target),
        removable: link.removable,
      })),
      ["relation", "kind", "detail", "title", "uri"],
      parsed,
    );
    return true;
  }

  if (action === "add" || action === "remove") {
    const pair = readPair(args, action);
    const method = action === "add" ? "link.add" : "link.remove";
    const changed = await withDaemon(() => requestDaemon(method, pair));
    printResult({ changed }, parsed);
    return true;
  }

  return false;
}
