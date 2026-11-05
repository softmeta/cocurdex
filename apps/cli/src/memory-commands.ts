import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  MemoryCloudMode,
  MemoryImportance,
  MemorySettings,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  handleMemoryLibraryCommand,
  memoryLibraryUsageLines,
} from "./memory-library-commands";
import type { ParsedArgs } from "./parse-args";
import { printResult, printRows, stringFlag } from "./parse-args";
import { createCredentialReader } from "./read-secret";

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

export function memoryCloudMode(action: string | undefined): MemoryCloudMode {
  if (action === "register" || action === "create") return "register";
  if (action === "signin" || action === "sign-in" || action === "login") {
    return "signin";
  }
  throw new Error(
    "Usage: cocurdex memory cloud register|signin --user <name> | signout | keys",
  );
}

async function handleCloudCommand(sub: string | undefined, parsed: ParsedArgs) {
  if (sub === "keys") {
    printResult(
      await withDaemon(() => requestDaemon("memory.cloud.keys")),
      parsed,
    );
    return;
  }

  if (sub === "signout" || sub === "disconnect") {
    printResult(
      await withDaemon(() => requestDaemon("memory.cloud.disconnect")),
      parsed,
    );
    return;
  }

  const mode = memoryCloudMode(sub);
  const user = stringFlag(parsed, "user");
  if (!user) throw new Error("Missing required --user");

  const reader = createCredentialReader();
  try {
    const password = await reader.read("Login password: ");
    if (!password) throw new Error("A login password is required");
    const recoveryKey =
      mode === "signin" ? await reader.read("Recovery key: ") : null;
    if (mode === "signin" && !recoveryKey) {
      throw new Error("A recovery key is required to sign in");
    }
    const result = await withDaemon(() =>
      requestDaemon("memory.cloud.connect", {
        mode,
        user,
        password,
        recoveryKey,
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(result, parsed);
      return;
    }
    if (result.recoveryKey) {
      console.log(`Recovery key: ${result.recoveryKey}`);
      console.log(
        "Save it now: it decrypts your memories on another device, and nobody can recover it for you.",
      );
    }
    printResult(result.status, parsed);
  } finally {
    reader.close();
  }
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
    "  cocurdex memory install [--force] [--json]",
    "  cocurdex memory doctor [--remote] [--check-update] [--json]",
    "  cocurdex memory sync on|off [--json]",
    "  cocurdex memory cloud register|signin --user <name> [--json]",
    "  cocurdex memory cloud signout|keys [--json]",
    "  cocurdex memory policy",
    "  Account secrets are read from a hidden prompt, or from piped stdin when not a terminal (signin: password, then recovery key).",
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

  if (action === "cloud") {
    await handleCloudCommand(args[0], parsed);
    return true;
  }

  if (await handleMemoryLibraryCommand(action, args, parsed)) return true;

  if (action === "policy") {
    const policy = await withDaemon(() => requestDaemon("memory.policy"));
    console.log(policy);
    return true;
  }

  return false;
}
