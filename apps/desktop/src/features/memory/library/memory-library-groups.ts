import type { MemoryEntry } from "@cocurdex/shared";

export interface MemoryDayGroup {
  day: string | null;
  entries: MemoryEntry[];
}

export interface MemoryTreeRow {
  entry: MemoryEntry;
  depth: number;
}

function entryTime(entry: MemoryEntry) {
  const value = entry.updatedAt ?? entry.createdAt;
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function localDay(time: number) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function newestFirst(left: MemoryEntry, right: MemoryEntry) {
  return (entryTime(right) ?? -1) - (entryTime(left) ?? -1);
}

export function groupMemoriesByDay(entries: MemoryEntry[]): MemoryDayGroup[] {
  const groups = new Map<string | null, MemoryEntry[]>();
  for (const entry of [...entries].sort(newestFirst)) {
    const time = entryTime(entry);
    const day = time === null ? null : localDay(time);
    const group = groups.get(day);
    if (group) group.push(entry);
    else groups.set(day, [entry]);
  }
  return [...groups].map(([day, grouped]) => ({ day, entries: grouped }));
}

export function buildMemoryTree(entries: MemoryEntry[]): MemoryTreeRow[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const children = new Map<string, MemoryEntry[]>();
  const roots: MemoryEntry[] = [];
  for (const entry of [...entries].sort(newestFirst)) {
    const parentId = entry.parentId;
    if (parentId && parentId !== entry.id && byId.has(parentId)) {
      const siblings = children.get(parentId);
      if (siblings) siblings.push(entry);
      else children.set(parentId, [entry]);
    } else {
      roots.push(entry);
    }
  }
  const rows: MemoryTreeRow[] = [];
  const visited = new Set<string>();
  const visit = (entry: MemoryEntry, depth: number) => {
    if (visited.has(entry.id)) return;
    visited.add(entry.id);
    rows.push({ entry, depth });
    for (const child of children.get(entry.id) ?? []) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);
  for (const entry of entries) visit(entry, 0);
  return rows;
}

export function filterMemories(entries: MemoryEntry[], query: string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.title, entry.content, ...entry.tags].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    ),
  );
}
