import type { DatabaseSync } from "node:sqlite";
import { parseJson, type SqliteRow } from "../sqlite-types";
import type {
  MemoryEntriesRepository,
  MemoryEntryChange,
  MemoryEntryHistoryRecord,
  MemoryEntryPatch,
  StoredMemoryEntry,
} from "./memory-entries-repository";

interface EntryRow extends SqliteRow {
  id: string;
  project: string | null;
  title: string;
  content: string;
  kind: string | null;
  importance: string;
  tags_json: string;
  parent_id: string | null;
  supersedes_json: string;
  superseded_by: string | null;
  see_also_json: string;
  device: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface HistoryRow extends SqliteRow {
  entry_id: string;
  action: string;
  title: string | null;
  content: string | null;
  actor: string | null;
  at: string;
}

const MIN_PREFIX_LENGTH = 6;
const LIVE = "deleted_at IS NULL AND superseded_by IS NULL";

function mapEntry(row: EntryRow): StoredMemoryEntry {
  return {
    id: row.id,
    project: row.project,
    title: row.title,
    content: row.content,
    kind: row.kind,
    importance: row.importance === "important" ? "important" : "trivial",
    tags: parseJson<string[]>(row.tags_json, []),
    parentId: row.parent_id,
    supersedes: parseJson<string[]>(row.supersedes_json, []),
    supersededBy: row.superseded_by,
    seeAlso: parseJson<string[]>(row.see_also_json, []),
    device: row.device,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function quoteFtsPhrase(term: string) {
  return `"${term.replaceAll('"', '""')}"`;
}

function escapeLike(term: string) {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function createSqliteMemoryEntriesRepository(
  database: DatabaseSync,
): MemoryEntriesRepository {
  const selectById = (id: string) =>
    database.prepare("SELECT * FROM memory_entries WHERE id = ?").get(id) as
      | EntryRow
      | undefined;

  const record = (
    entryId: string,
    action: string,
    entry: Pick<StoredMemoryEntry, "title" | "content"> | null,
    change: MemoryEntryChange,
  ) => {
    database
      .prepare(
        `INSERT INTO memory_entry_history
           (entry_id, action, title, content, actor, at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entryId,
        action,
        entry?.title ?? null,
        entry?.content ?? null,
        change.actor,
        change.at,
      );
  };

  return {
    find(idOrPrefix) {
      const exact = selectById(idOrPrefix);
      if (exact) return mapEntry(exact);
      if (idOrPrefix.length < MIN_PREFIX_LENGTH) return null;
      const rows = database
        .prepare(
          "SELECT * FROM memory_entries WHERE id LIKE ? ESCAPE '\\' LIMIT 2",
        )
        .all(`${escapeLike(idOrPrefix)}%`) as EntryRow[];
      return rows.length === 1 ? mapEntry(rows[0]) : null;
    },

    findByRemoteId(provider, remoteId) {
      const row = database
        .prepare(
          `SELECT memory_entries.* FROM memory_entries
           JOIN memory_entry_links ON memory_entry_links.entry_id = memory_entries.id
           WHERE memory_entry_links.provider = ? AND memory_entry_links.remote_id = ?`,
        )
        .get(provider, remoteId) as EntryRow | undefined;
      return row ? mapEntry(row) : null;
    },

    remoteIds(provider) {
      const rows = database
        .prepare(
          "SELECT entry_id, remote_id FROM memory_entry_links WHERE provider = ?",
        )
        .all(provider) as { entry_id: string; remote_id: string }[];
      return new Map(rows.map((row) => [row.entry_id, row.remote_id]));
    },

    list(input) {
      const filters = ["deleted_at IS NULL"];
      const parameters: (string | number)[] = [];
      if (input.project !== null) {
        filters.push("project = ?");
        parameters.push(input.project);
      }
      if (input.since !== null) {
        filters.push("updated_at >= ?");
        parameters.push(input.since);
      }
      const rows = database
        .prepare(
          `SELECT * FROM memory_entries
           WHERE ${filters.join(" AND ")}
           ORDER BY updated_at DESC, id ASC
           LIMIT ?`,
        )
        .all(...parameters, input.limit) as EntryRow[];
      return rows.map(mapEntry);
    },

    all() {
      const rows = database
        .prepare("SELECT * FROM memory_entries ORDER BY created_at ASC, id ASC")
        .all() as EntryRow[];
      return rows.map(mapEntry);
    },

    search(input) {
      const scope = input.project === null ? "" : " AND e.project = ?";
      const scopeParameters = input.project === null ? [] : [input.project];
      const found = new Map<string, StoredMemoryEntry>();
      if (input.indexedTerms.length > 0) {
        const rows = database
          .prepare(
            `SELECT e.* FROM memory_fts
             JOIN memory_entries e ON e.id = memory_fts.entry_id
             WHERE memory_fts MATCH ?
               AND e.deleted_at IS NULL AND e.superseded_by IS NULL${scope}
             ORDER BY bm25(memory_fts, 0.0, 4.0, 1.0, 2.0)
             LIMIT ?`,
          )
          .all(
            input.indexedTerms.map(quoteFtsPhrase).join(" OR "),
            ...scopeParameters,
            input.limit,
          ) as EntryRow[];
        for (const row of rows) found.set(row.id, mapEntry(row));
      }
      for (const term of input.shortTerms) {
        const pattern = `%${escapeLike(term)}%`;
        const rows = database
          .prepare(
            `SELECT e.* FROM memory_entries e
             WHERE ${LIVE}${scope}
               AND (e.title LIKE ? ESCAPE '\\'
                 OR e.content LIKE ? ESCAPE '\\'
                 OR e.tags_json LIKE ? ESCAPE '\\')
             ORDER BY e.updated_at DESC
             LIMIT ?`,
          )
          .all(
            ...scopeParameters,
            pattern,
            pattern,
            pattern,
            input.limit,
          ) as EntryRow[];
        for (const row of rows) found.set(row.id, mapEntry(row));
      }
      return [...found.values()];
    },

    insert(entry, change) {
      database
        .prepare(
          `INSERT INTO memory_entries
             (id, project, title, content, kind, importance, tags_json,
              parent_id, supersedes_json, superseded_by, see_also_json, device,
              created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          entry.project,
          entry.title,
          entry.content,
          entry.kind,
          entry.importance,
          JSON.stringify(entry.tags),
          entry.parentId,
          JSON.stringify(entry.supersedes),
          entry.supersededBy,
          JSON.stringify(entry.seeAlso),
          entry.device,
          entry.createdAt,
          entry.updatedAt,
          entry.deletedAt,
        );
      record(entry.id, "create", entry, change);
    },

    update(id, patch: MemoryEntryPatch, change) {
      const row = selectById(id);
      if (!row) return false;
      const current = mapEntry(row);
      const next = { ...current, ...patch };
      database
        .prepare(
          `UPDATE memory_entries
           SET project = ?, title = ?, content = ?, kind = ?, importance = ?,
               tags_json = ?, parent_id = ?, supersedes_json = ?,
               superseded_by = ?, see_also_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          next.project,
          next.title,
          next.content,
          next.kind,
          next.importance,
          JSON.stringify(next.tags),
          next.parentId,
          JSON.stringify(next.supersedes),
          next.supersededBy,
          JSON.stringify(next.seeAlso),
          patch.updatedAt ?? change.at,
          id,
        );
      record(id, "update", current, change);
      return true;
    },

    softDelete(id, change) {
      const row = selectById(id);
      if (!row || row.deleted_at) return false;
      database
        .prepare("UPDATE memory_entries SET deleted_at = ? WHERE id = ?")
        .run(change.at, id);
      record(id, "delete", mapEntry(row), change);
      return true;
    },

    restore(id, change) {
      const row = selectById(id);
      if (!row?.deleted_at) return false;
      database
        .prepare("UPDATE memory_entries SET deleted_at = NULL WHERE id = ?")
        .run(id);
      record(id, "restore", mapEntry(row), change);
      return true;
    },

    setRemoteId(provider, id, remoteId) {
      if (remoteId === null) {
        database
          .prepare(
            "DELETE FROM memory_entry_links WHERE entry_id = ? AND provider = ?",
          )
          .run(id, provider);
        return;
      }
      database
        .prepare(
          `DELETE FROM memory_entry_links
           WHERE provider = ? AND remote_id = ? AND entry_id <> ?`,
        )
        .run(provider, remoteId, id);
      database
        .prepare(
          `INSERT INTO memory_entry_links (entry_id, provider, remote_id)
           VALUES (?, ?, ?)
           ON CONFLICT(entry_id, provider) DO UPDATE SET remote_id = excluded.remote_id`,
        )
        .run(id, provider, remoteId);
    },

    history(input): MemoryEntryHistoryRecord[] {
      const rows = (
        input.id === null
          ? database
              .prepare(
                "SELECT * FROM memory_entry_history ORDER BY seq DESC LIMIT ?",
              )
              .all(input.limit)
          : database
              .prepare(
                `SELECT * FROM memory_entry_history
                 WHERE entry_id = ? ORDER BY seq DESC LIMIT ?`,
              )
              .all(input.id, input.limit)
      ) as HistoryRow[];
      return rows.map((row) => ({
        entryId: row.entry_id,
        action: row.action,
        title: row.title,
        content: row.content,
        actor: row.actor,
        at: row.at,
      }));
    },

    revision() {
      const row = database
        .prepare(
          "SELECT COALESCE(MAX(seq), 0) AS revision FROM memory_entry_history",
        )
        .get() as { revision: number };
      return row.revision;
    },
  };
}
