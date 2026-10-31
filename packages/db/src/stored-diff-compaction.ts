import type { DatabaseSync } from "node:sqlite";
import {
  type AgentToolCallContent,
  summarizeToolCallDiff,
} from "@cocurdex/shared";

const PAGE_SIZE = 200;

interface ToolCallContentRow {
  row_id: number;
  content_json: string;
}

function summarizeContent(contentJson: string): string | null {
  let content: unknown;
  try {
    content = JSON.parse(contentJson);
  } catch {
    return null;
  }
  if (!Array.isArray(content)) {
    return null;
  }
  let changed = false;
  const summarized = content.map((item: AgentToolCallContent) => {
    if (item?.type !== "diff" || typeof item.newText !== "string") {
      return item;
    }
    changed = true;
    return summarizeToolCallDiff(item);
  });
  return changed ? JSON.stringify(summarized) : null;
}

function withoutNativePatches(nativeFilesJson: string): string | null {
  let files: unknown;
  try {
    files = JSON.parse(nativeFilesJson);
  } catch {
    return null;
  }
  if (
    !Array.isArray(files) ||
    !files.some((file) => file && typeof file === "object" && "patch" in file)
  ) {
    return null;
  }
  return JSON.stringify(
    files.map((file) => {
      if (!file || typeof file !== "object") {
        return file;
      }
      const { patch: _patch, ...rest } = file as Record<string, unknown>;
      return rest;
    }),
  );
}

function compactNativeFilePatches(database: DatabaseSync): void {
  const rows = database
    .prepare(
      `SELECT rowid AS row_id, native_files_json FROM turn_change_sets
       WHERE native_files_json LIKE '%"patch"%'`,
    )
    .all() as unknown as { row_id: number; native_files_json: string }[];
  const update = database.prepare(
    "UPDATE turn_change_sets SET native_files_json = ? WHERE rowid = ?",
  );
  for (const row of rows) {
    const compacted = withoutNativePatches(row.native_files_json);
    if (compacted !== null) {
      update.run(compacted, row.row_id);
    }
  }
}

export function compactStoredDiffs(database: DatabaseSync): void {
  compactToolCallDiffs(database);
  compactNativeFilePatches(database);
}

function compactToolCallDiffs(database: DatabaseSync): void {
  const select = database.prepare(
    `SELECT rowid AS row_id, content_json FROM tool_calls
     WHERE rowid > ? AND content_json LIKE '%"type":"diff"%'
     ORDER BY rowid LIMIT ?`,
  );
  const update = database.prepare(
    "UPDATE tool_calls SET content_json = ? WHERE rowid = ?",
  );
  let afterRowId = 0;
  for (;;) {
    const rows = select.all(
      afterRowId,
      PAGE_SIZE,
    ) as unknown as ToolCallContentRow[];
    for (const row of rows) {
      const summarized = summarizeContent(row.content_json);
      if (summarized !== null) {
        update.run(summarized, row.row_id);
      }
    }
    if (rows.length < PAGE_SIZE) {
      return;
    }
    afterRowId = rows[rows.length - 1]?.row_id ?? afterRowId;
  }
}
