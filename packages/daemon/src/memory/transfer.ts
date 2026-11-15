import { isMemoryImportance } from "@cocurdex/shared";
import type { MemoryTransferEntry } from "./provider";

function text(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function list(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * The portable memory file: a JSON array of entries with snake_case fields,
 * the shape `rsrs export` writes and `rsrs import` reads.
 */
export function parseMemoryTransfer(raw: string): MemoryTransferEntry[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("A memory file holds a JSON array of entries");
  }
  return parsed.flatMap((value): MemoryTransferEntry[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const id = text(row.id);
    const content = text(row.content);
    if (!id || !content) return [];
    return [
      {
        id,
        title: text(row.title) ?? id,
        content,
        kind: text(row.kind) ?? text(row.type),
        importance: isMemoryImportance(row.importance)
          ? row.importance
          : "trivial",
        tags: list(row.tags),
        project: text(row.project),
        parentId: text(row.parent_id) ?? text(row.parentId),
        supersedes: list(row.supersedes),
        supersededBy: text(row.superseded_by),
        seeAlso: list(row.see_also),
        createdAt: text(row.created_at) ?? text(row.createdAt),
        updatedAt: text(row.updated_at) ?? text(row.updatedAt),
        device: text(row.device),
      },
    ];
  });
}

export function serializeMemoryTransfer(entries: MemoryTransferEntry[]) {
  return JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind ?? "context",
      tags: entry.tags,
      title: entry.title,
      content: entry.content,
      project: entry.project ?? "",
      created_at: entry.createdAt ?? "",
      updated_at: entry.updatedAt ?? "",
      parent_id: entry.parentId ?? "",
      importance: entry.importance,
      device: entry.device ?? "",
      supersedes: entry.supersedes.join(","),
      superseded_by: entry.supersededBy ?? "",
      see_also: entry.seeAlso,
    })),
    null,
    2,
  );
}
