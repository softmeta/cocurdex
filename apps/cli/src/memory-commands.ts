import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import type { MemoryImportance, MemorySettings } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, printRows, stringFlag } from "./parse-args";

function importanceFlag(parsed: ParsedArgs): MemoryImportance | undefined {
  const value = stringFlag(parsed, "importance");
  if (!value) return undefined;
  if (value !== "important" && value !== "trivial") {
    throw new Error("--importance must be important or trivial");
  }
  return value;
}

function listFlag(parsed: ParsedArgs, name: string) {
  return (stringFlag(parsed, name) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function readContent(args: string[], parsed: ParsedArgs) {
  const file = stringFlag(parsed, "file");
  if (file) return readFile(file, "utf8");
  const content = stringFlag(parsed, "content");
  if (content) return content;
  const positional = args.join(" ").trim();
  if (!positional) {
    throw new Error(
      "Provide memory content with --content, --file, or a positional string",
    );
  }
  return positional;
}

export function memoryUsageLines() {
  return [
    "  cocurdex memory status [--refresh] [--json]",
    "  cocurdex memory on|off [--json]",
    "  cocurdex memory recall <query> [--limit <n>] [--project <name>] [--json]",
    "  cocurdex memory show <id> [--json]",
    "  cocurdex memory remember --title <title> [--content <text> | --file <path> | <text>] [--importance important|trivial] [--parent <id>] [--tags a,b] [--force] [--json]",
    "  cocurdex memory save-session <session-id> [--force] [--importance important|trivial] [--json]",
    "  cocurdex memory install [--force] [--json]",
    "  cocurdex memory doctor [--remote] [--check-update] [--json]",
    "  cocurdex memory sync on|off [--json]",
    "  cocurdex memory policy",
  ];
}

export async function handleMemoryCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (!action || action === "status") {
    const status = await withDaemon(() =>
      requestDaemon("memory.status", { refresh: parsed.flags.has("refresh") }),
    );
    printResult(status, parsed);
    return true;
  }

  if (action === "on" || action === "off") {
    const settings = await withDaemon(() =>
      requestDaemon("memory.settings.get"),
    );
    const saved = await withDaemon(() =>
      requestDaemon("memory.settings.set", {
        settings: { ...settings, enabled: action === "on" } as MemorySettings,
      }),
    );
    printResult(saved, parsed);
    return true;
  }

  if (action === "recall") {
    const query = args.join(" ").trim() || stringFlag(parsed, "query");
    if (!query) throw new Error("Usage: cocurdex memory recall <query>");
    const limit = Number(stringFlag(parsed, "limit") ?? "8");
    const result = await withDaemon(() =>
      requestDaemon("memory.recall", {
        query,
        limit: Number.isFinite(limit) ? limit : 8,
        project: stringFlag(parsed, "project") ?? null,
      }),
    );
    printRows(result.items, ["id", "title", "score"], parsed);
    return true;
  }

  if (action === "show") {
    const id = args[0] ?? stringFlag(parsed, "id");
    if (!id) throw new Error("Usage: cocurdex memory show <id>");
    printResult(
      await withDaemon(() => requestDaemon("memory.show", { id })),
      parsed,
    );
    return true;
  }

  if (action === "remember") {
    const title = stringFlag(parsed, "title");
    if (!title)
      throw new Error("Usage: cocurdex memory remember --title <title>");
    const content = await readContent(args, parsed);
    const result = await withDaemon(() =>
      requestDaemon("memory.remember", {
        content,
        title,
        importance: importanceFlag(parsed) ?? "trivial",
        tags: listFlag(parsed, "tags"),
        project: stringFlag(parsed, "project") ?? null,
        parentId: stringFlag(parsed, "parent") ?? null,
        type: stringFlag(parsed, "type") ?? null,
        force: parsed.flags.has("force"),
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "save-session") {
    const sessionId = args[0] ?? stringFlag(parsed, "session");
    if (!sessionId) {
      throw new Error("Usage: cocurdex memory save-session <session-id>");
    }
    const result = await withDaemon(() =>
      requestDaemon("memory.session.save", {
        sessionId,
        force: parsed.flags.has("force"),
        importance: importanceFlag(parsed),
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "install") {
    const result = await withDaemon(() =>
      requestDaemon("memory.install", { force: parsed.flags.has("force") }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "doctor") {
    const result = await withDaemon(() =>
      requestDaemon("memory.doctor", {
        remote: parsed.flags.has("remote"),
        checkUpdate: parsed.flags.has("check-update"),
      }),
    );
    printResult(result, parsed);
    return true;
  }

  if (action === "sync") {
    const mode = args[0] ?? stringFlag(parsed, "mode");
    if (mode !== "on" && mode !== "off") {
      throw new Error("Usage: cocurdex memory sync on|off");
    }
    const status = await withDaemon(() =>
      requestDaemon("memory.cloud.setSync", { enabled: mode === "on" }),
    );
    printResult(status, parsed);
    return true;
  }

  if (action === "policy") {
    const policy = await withDaemon(() => requestDaemon("memory.policy"));
    console.log(policy);
    return true;
  }

  return false;
}
