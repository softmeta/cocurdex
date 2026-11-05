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
  parseRsrsJson,
  type RsrsExecutable,
  rsrsErrorText,
  runRsrs,
  stringValue,
} from "./rsrs";

const LIBRARY_READ_TIMEOUT_MS = 30_000;
const LIBRARY_WRITE_TIMEOUT_MS = 120_000;
const TRANSFER_TIMEOUT_MS = 600_000;

async function runRsrsJson(
  executable: RsrsExecutable,
  args: string[],
  timeoutMs: number,
) {
  const result = await runRsrs(executable, [...args, "--json"], { timeoutMs });
  let payload: Record<string, unknown> | null = null;
  try {
    payload = parseRsrsJson(result.stdout);
  } catch {
    payload = null;
  }
  const error = payload ? rsrsErrorText(payload) : null;
  if (result.code !== 0 || !payload) {
    const detail = error ?? result.stderr.trim();
    throw new Error(
      detail || `rsrs ${args[0]} exited with code ${result.code ?? "unknown"}`,
    );
  }
  return payload;
}

export async function listMemories(
  executable: RsrsExecutable,
  input: { limit: number; since?: string | null },
): Promise<MemoryEntry[]> {
  const args = ["list", "--limit", String(input.limit)];
  if (input.since) args.push("--since", input.since);
  const payload = await runRsrsJson(executable, args, LIBRARY_READ_TIMEOUT_MS);
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((row) => {
    const entry = parseEntryRecord(row);
    return entry ? [entry] : [];
  });
}

export async function updateMemory(
  executable: RsrsExecutable,
  input: MemoryUpdateInput,
) {
  const args = ["update", input.id];
  if (input.title !== undefined) args.push("--title", input.title);
  if (input.content !== undefined) args.push("--content", input.content);
  if (input.tags !== undefined) args.push("--tags", input.tags.join(","));
  if (input.importance !== undefined) {
    args.push("--importance", input.importance);
  }
  await runRsrsJson(executable, args, LIBRARY_WRITE_TIMEOUT_MS);
}

export async function forgetMemory(executable: RsrsExecutable, id: string) {
  await runRsrsJson(executable, ["forget", id], LIBRARY_WRITE_TIMEOUT_MS);
}

export async function restoreMemory(executable: RsrsExecutable, id: string) {
  await runRsrsJson(executable, ["restore", id], LIBRARY_WRITE_TIMEOUT_MS);
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
  executable: RsrsExecutable,
  input: { id?: string | null; limit: number },
): Promise<MemoryHistoryEntry[]> {
  const args = ["history"];
  if (input.id) args.push(input.id);
  args.push("--limit", String(input.limit));
  const payload = await runRsrsJson(executable, args, LIBRARY_READ_TIMEOUT_MS);
  const details = Array.isArray(payload.details) ? payload.details : [];
  return details.flatMap((row) => {
    const entry = parseHistoryRow(row);
    return entry ? [entry] : [];
  });
}

export async function readMemoryRevision(
  executable: RsrsExecutable,
): Promise<string | null> {
  const payload = await runRsrsJson(
    executable,
    ["memory-revision"],
    LIBRARY_READ_TIMEOUT_MS,
  );
  const summary = asRecord(payload.summary);
  const revision = summary?.revision;
  if (typeof revision === "number") return String(revision);
  return stringValue(revision);
}

export async function exportMemories(executable: RsrsExecutable, file: string) {
  await runRsrsJson(executable, ["export", file], TRANSFER_TIMEOUT_MS);
}

export async function importMemories(
  executable: RsrsExecutable,
  file: string,
): Promise<MemoryImportResult> {
  const payload = await runRsrsJson(
    executable,
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
  return {
    partitions: commands.has("recall") && commands.has("remember"),
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
