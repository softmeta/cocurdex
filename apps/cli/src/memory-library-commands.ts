import { readFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  MemoryImportance,
  MemoryPartition,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, printRows, stringFlag } from "./parse-args";

export function memoryPartitionFlag(
  value: string | undefined,
): MemoryPartition | null {
  if (!value) return null;
  if (value === "me") return { kind: "me" };
  const agentId = value.startsWith("agent:") ? value.slice(6).trim() : "";
  if (!agentId) {
    throw new Error("--partition must be me or agent:<persona-id>");
  }
  return { kind: "agent", agentId };
}

function limitFlag(parsed: ParsedArgs, fallback: number) {
  const value = Number(stringFlag(parsed, "limit") ?? fallback);
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

function requireId(args: string[], parsed: ParsedArgs, usage: string) {
  const id = args[0] ?? stringFlag(parsed, "id");
  if (!id) throw new Error(`Usage: ${usage}`);
  return id;
}

function importanceFlag(parsed: ParsedArgs): MemoryImportance | undefined {
  const value = stringFlag(parsed, "importance");
  if (!value) return undefined;
  if (value !== "important" && value !== "trivial") {
    throw new Error("--importance must be important or trivial");
  }
  return value;
}

async function updateInput(
  id: string,
  parsed: ParsedArgs,
): Promise<MemoryUpdateInput> {
  const file = stringFlag(parsed, "file");
  const content = file
    ? await readFile(file, "utf8")
    : stringFlag(parsed, "content");
  const tags = stringFlag(parsed, "tags");
  const input: MemoryUpdateInput = {
    id,
    title: stringFlag(parsed, "title"),
    content,
    tags:
      tags === undefined
        ? undefined
        : tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
    importance: importanceFlag(parsed),
  };
  const changed = Object.entries(input).some(
    ([key, value]) => key !== "id" && value !== undefined,
  );
  if (!changed) {
    throw new Error(
      "Pass at least one of --title, --content, --file, --tags, --importance",
    );
  }
  return input;
}

export function memoryLibraryUsageLines() {
  return [
    "  cocurdex memory list [--partition me|agent:<persona-id>] [--since <date>] [--limit <n>] [--json]",
    "  cocurdex memory update <id> [--title <title>] [--content <text> | --file <path>] [--tags a,b] [--importance important|trivial] [--json]",
    "  cocurdex memory forget <id> [--json]",
    "  cocurdex memory restore <full-id> [--json]",
    "  cocurdex memory history [<id>] [--limit <n>] [--json]",
    "  cocurdex memory revision [--json]",
    "  cocurdex memory export <file> [--json]",
    "  cocurdex memory import <file> [--json]",
  ];
}

export async function handleMemoryLibraryCommand(
  action: string,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "list") {
    const result = await withDaemon(() =>
      requestDaemon("memory.list", {
        limit: limitFlag(parsed, 50),
        since: stringFlag(parsed, "since") ?? null,
        partition: memoryPartitionFlag(stringFlag(parsed, "partition")),
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(result, parsed);
      return true;
    }
    printRows(result.items, ["id", "title", "importance", "updatedAt"], parsed);
    if (result.error) console.error(result.error);
    return true;
  }

  if (action === "update") {
    const id = requireId(args, parsed, "cocurdex memory update <id> --title …");
    const input = await updateInput(id, parsed);
    printResult(
      await withDaemon(() => requestDaemon("memory.update", input)),
      parsed,
    );
    return true;
  }

  if (action === "forget" || action === "restore") {
    const id = requireId(args, parsed, `cocurdex memory ${action} <id>`);
    await withDaemon(() => requestDaemon(`memory.${action}`, { id }));
    printResult(
      { id, [action === "forget" ? "forgotten" : "restored"]: true },
      parsed,
    );
    return true;
  }

  if (action === "history") {
    const rows = await withDaemon(() =>
      requestDaemon("memory.history", {
        id: args[0] ?? stringFlag(parsed, "id") ?? null,
        limit: limitFlag(parsed, 50),
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(rows, parsed);
      return true;
    }
    printRows(rows, ["at", "action", "entryId", "title"], parsed);
    return true;
  }

  if (action === "revision") {
    const revision = await withDaemon(() => requestDaemon("memory.revision"));
    printResult({ revision }, parsed);
    return true;
  }

  if (action === "export" || action === "import") {
    const file = args[0] ?? stringFlag(parsed, "file");
    if (!file) throw new Error(`Usage: cocurdex memory ${action} <file>`);
    const absolute = path.resolve(file);
    if (action === "export") {
      await withDaemon(() =>
        requestDaemon("memory.export", { file: absolute }),
      );
      printResult({ file: absolute, exported: true }, parsed);
      return true;
    }
    printResult(
      await withDaemon(() =>
        requestDaemon("memory.import", { file: absolute }),
      ),
      parsed,
    );
    return true;
  }

  return false;
}
