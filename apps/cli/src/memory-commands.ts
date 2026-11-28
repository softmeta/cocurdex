import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  isMemoryProviderId,
  MEMORY_SYNC_MANAGED_BY_RSRS,
  type MemoryImportance,
  type MemorySettings,
  ReasonError,
  withMemoryProvider,
  withMemoryProviderSettings,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  handleMemoryLibraryCommand,
  memoryLibraryUsageLines,
} from "./memory-library-commands";
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

async function handleRsrsCommand(args: string[], parsed: ParsedArgs) {
  const [sub = "status"] = args;
  if (sub === "status") {
    const status = await withDaemon(() => requestDaemon("memory.status", {}));
    printResult(
      {
        enabled: status.settings.rsrs,
        ready: status.rsrsAvailable,
        installation: status.installation,
        version: status.version,
        error: status.error,
      },
      parsed,
    );
    return;
  }
  if (sub === "on" || sub === "off") {
    const settings = await withDaemon(() =>
      requestDaemon("memory.settings.get"),
    );
    const provider =
      sub === "on"
        ? "rsrs"
        : settings.provider === "rsrs"
          ? null
          : settings.provider;
    printResult(
      await withDaemon(() =>
        requestDaemon("memory.settings.set", {
          settings: withMemoryProvider(settings, provider),
        }),
      ),
      parsed,
    );
    return;
  }
  if (sub === "sync") {
    const method = parsed.flags.has("dry-run")
      ? "memory.rsrs.preview"
      : "memory.rsrs.sync";
    printResult(await withDaemon(() => requestDaemon(method)), parsed);
    return;
  }
  throw new Error(
    "Usage: cocurdex memory rsrs [status] | on | off | sync [--dry-run]",
  );
}

const PROVIDER_USAGE =
  "Usage: cocurdex memory provider [status] | use <none|rsrs|ai-memory> [--server-url <url>] | sync [--dry-run]";

async function handleProviderCommand(args: string[], parsed: ParsedArgs) {
  const [sub = "status", choice] = args;
  if (sub === "status") {
    const status = await withDaemon(() =>
      requestDaemon("memory.status", { refresh: parsed.flags.has("refresh") }),
    );
    printResult(
      {
        provider: status.settings.provider,
        providers: status.settings.providers,
        status: status.provider,
      },
      parsed,
    );
    return;
  }
  if (sub === "use") {
    const provider = choice === "none" ? null : choice;
    if (provider !== null && !isMemoryProviderId(provider)) {
      throw new Error(PROVIDER_USAGE);
    }
    const serverUrl = stringFlag(parsed, "server-url");
    let settings = withMemoryProvider(
      await withDaemon(() => requestDaemon("memory.settings.get")),
      provider,
    );
    if (serverUrl !== undefined) {
      settings = withMemoryProviderSettings(settings, {
        aiMemory: { serverUrl },
      });
    }
    const saved = await withDaemon(() =>
      requestDaemon("memory.settings.set", { settings }),
    );
    printResult(
      { provider: saved.provider, providers: saved.providers },
      parsed,
    );
    return;
  }
  if (sub === "sync") {
    printResult(
      await withDaemon(() =>
        requestDaemon("memory.sync", { dryRun: parsed.flags.has("dry-run") }),
      ),
      parsed,
    );
    return;
  }
  throw new Error(PROVIDER_USAGE);
}

export function memoryUsageLines() {
  return [
    "  cocurdex memory status [--refresh] [--json]",
    "  cocurdex memory on|off [--json]",
    "  cocurdex memory recall <query> [--limit <n>] [--project <name>] [--json]",
    "  cocurdex memory show <id> [--json]",
    "  cocurdex memory remember --title <title> [--content <text> | --file <path> | <text>] [--importance important|trivial] [--parent <id>] [--tags a,b] [--force] [--json]",
    ...memoryLibraryUsageLines(),
    "  cocurdex memory save-session <session-id> [--force] [--importance important|trivial] [--json]",
    "  cocurdex memory provider [status] [--refresh] [--json]",
    "  cocurdex memory provider use <none|rsrs|ai-memory> [--server-url <url>] [--json]",
    "  cocurdex memory provider sync [--dry-run] [--json]",
    "  cocurdex memory rsrs [status] | on | off [--json]",
    "  cocurdex memory rsrs sync [--dry-run] [--json]",
    "  cocurdex memory install [--force] [--json]",
    "  cocurdex memory doctor [--remote] [--check-update] [--json]",
    "  cocurdex memory policy",
    "  Multi-device sync is managed by rsrs: rsrs login, then rsrs web or the rsrs app.",
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
    if (parsed.flags.has("json")) {
      printResult(result, parsed);
      return true;
    }
    printRows(result.items, ["id", "title", "score"], parsed);
    if (result.error) console.error(result.error);
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

  if (action === "rsrs") {
    await handleRsrsCommand(args, parsed);
    return true;
  }

  if (action === "provider") {
    await handleProviderCommand(args, parsed);
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

  if (action === "sync" || action === "cloud") {
    throw new ReasonError(
      "memory.syncManagedByRsrs",
      MEMORY_SYNC_MANAGED_BY_RSRS,
    );
  }

  if (await handleMemoryLibraryCommand(action, args, parsed)) return true;

  if (action === "policy") {
    const policy = await withDaemon(() => requestDaemon("memory.policy"));
    console.log(policy);
    return true;
  }

  return false;
}
