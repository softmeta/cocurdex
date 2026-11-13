import type {
  MemoryEntry,
  MemoryHistoryEntry,
  MemoryImportResult,
  MemoryProviderCapabilities,
  MemoryUpdateInput,
} from "@cocurdex/shared";
import {
  asRecord,
  numberValue,
  parseEntryRecord,
  type RsrsExecutable,
  rsrsErrorText,
  runRsrs,
  stringValue,
} from "./rsrs";
import type { RsrsInvoke } from "./rsrs-invoke";

const LIBRARY_READ_TIMEOUT_MS = 30_000;
const LIBRARY_WRITE_TIMEOUT_MS = 120_000;
const TRANSFER_TIMEOUT_MS = 600_000;

async function runRsrsJson(
  invoke: RsrsInvoke,
  args: string[],
  timeoutMs: number,
) {
  const [command, ...rest] = args;
  const { payload, exit } = await invoke(
    [command, "--json", ...rest],
    timeoutMs,
  );
  if (exit !== 0 || payload.status === "fail") {
    throw new Error(
      rsrsErrorText(payload) ??
        `rsrs ${command} exited with code ${exit ?? "unknown"}`,
    );
  }
  return payload;
}

export async function listMemories(
  invoke: RsrsInvoke,
  input: { limit: number; since?: string | null },
): Promise<MemoryEntry[]> {
  const args = ["list", "--limit", String(input.limit)];
  if (input.since) args.push("--since", input.since);
  const payload = await runRsrsJson(invoke, args, LIBRARY_READ_TIMEOUT_MS);
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((row) => {
    const entry = parseEntryRecord(row);
    return entry ? [entry] : [];
  });
}

export async function updateMemory(
  invoke: RsrsInvoke,
  input: MemoryUpdateInput,
) {
  const args = ["update", input.id];
  if (input.title !== undefined) args.push("--title", input.title);
  if (input.content !== undefined) args.push("--content", input.content);
  if (input.tags !== undefined) args.push("--tags", input.tags.join(","));
  if (input.importance !== undefined) {
    args.push("--importance", input.importance);
  }
  await runRsrsJson(invoke, args, LIBRARY_WRITE_TIMEOUT_MS);
}

export async function forgetMemory(invoke: RsrsInvoke, id: string) {
  await runRsrsJson(invoke, ["forget", id], LIBRARY_WRITE_TIMEOUT_MS);
}

export async function restoreMemory(invoke: RsrsInvoke, id: string) {
  await runRsrsJson(invoke, ["restore", id], LIBRARY_WRITE_TIMEOUT_MS);
}

function parseHistoryRow(value: unknown): MemoryHistoryEntry | null {
  const row = asRecord(value);
  const entryId = stringValue(row?.entry_id);
  if (!row || !entryId) return null;
  return {
    entryId,
    action: stringValue(row.action) ?? "update",
    title: stringValue(row.title) ?? stringValue(row.title_head),
    excerpt: stringValue(row.content) ?? stringValue(row.content_head),
    actor: stringValue(row.actor),
    at: stringValue(row.ts),
  };
}

export async function readMemoryHistory(
  invoke: RsrsInvoke,
  input: { id?: string | null; limit: number },
): Promise<MemoryHistoryEntry[]> {
  const args = ["history"];
  if (input.id) args.push(input.id);
  args.push("--limit", String(input.limit));
  const payload = await runRsrsJson(invoke, args, LIBRARY_READ_TIMEOUT_MS);
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((row) => {
    const entry = parseHistoryRow(row);
    return entry ? [entry] : [];
  });
}

export async function readMemoryRevision(
  invoke: RsrsInvoke,
): Promise<string | null> {
  const payload = await runRsrsJson(
    invoke,
    ["memory-revision"],
    LIBRARY_READ_TIMEOUT_MS,
  );
  const summary = asRecord(payload.summary);
  const revision = summary?.revision;
  if (typeof revision === "number") return String(revision);
  return stringValue(revision);
}

export async function exportMemories(invoke: RsrsInvoke, file: string) {
  await runRsrsJson(invoke, ["export", file], TRANSFER_TIMEOUT_MS);
}

export async function importMemories(
  invoke: RsrsInvoke,
  file: string,
): Promise<MemoryImportResult> {
  const payload = await runRsrsJson(
    invoke,
    ["import", file],
    TRANSFER_TIMEOUT_MS,
  );
  const summary = asRecord(payload.summary);
  return {
    imported: numberValue(summary?.imported) ?? 0,
    duplicates: numberValue(summary?.duplicates) ?? 0,
    skipped: numberValue(summary?.skipped) ?? 0,
  };
}

const NO_LIBRARY_CAPABILITIES: MemoryProviderCapabilities = {
  partitions: false,
  list: false,
  update: false,
  forget: false,
  restore: false,
  history: false,
  revision: false,
  export: false,
  import: false,
};

export async function readRsrsLibraryCapabilities(
  executable: RsrsExecutable,
): Promise<MemoryProviderCapabilities> {
  const result = await runRsrs(executable, ["--help"], {
    timeoutMs: LIBRARY_READ_TIMEOUT_MS,
  }).catch(() => null);
  if (result?.code !== 0 || !result) return NO_LIBRARY_CAPABILITIES;
  const commands = new Set(
    [...result.stdout.matchAll(/^\s{2}([a-z][a-z-]*)\s/gm)].map(
      (match) => match[1],
    ),
  );
  const supportsProject = async (command: string) => {
    const help = await runRsrs(executable, [command, "--help"], {
      timeoutMs: LIBRARY_READ_TIMEOUT_MS,
    });
    return help.code === 0 && /--project\b/.test(help.stdout);
  };
  const scoped =
    commands.has("recall") && commands.has("remember")
      ? await Promise.all([
          supportsProject("recall"),
          supportsProject("remember"),
        ]).catch(() => [false, false])
      : [false, false];
  return {
    partitions: scoped.every(Boolean),
    list: commands.has("list"),
    update: commands.has("update"),
    forget: commands.has("forget"),
    restore: commands.has("restore"),
    history: commands.has("history"),
    revision: commands.has("memory-revision"),
    export: commands.has("export"),
    import: commands.has("import"),
  };
}
