import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  applyMarkdownToNoteDoc,
  applyNoteDocUpdate,
  createNoteDocState,
  diffNoteDoc,
  noteDocToMarkdown,
} from "@cocurdex/note-doc";
import type {
  CreateNotePayload,
  NoteKind,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  UpdateNotePayload,
} from "@cocurdex/shared";
import type { SqliteRow } from "../sqlite-types";
import { extractNoteMetadata } from "./note-metadata";
import {
  NoteConflictError,
  type NoteDocApplyResult,
  type NoteDocRecord,
  NoteNotFoundError,
  type NotesRepository,
} from "./notes-repository";

const NOTE_SUMMARY_COLUMNS = `id, parent_id, workspace_id, kind, title, icon,
  '' AS body_markdown, NULL AS doc_state, sort_order, revision, created_at,
  updated_at`;

interface NoteRow extends SqliteRow {
  id: string;
  parent_id: string | null;
  workspace_id: string | null;
  kind: NoteKind;
  title: string;
  icon: string | null;
  body_markdown: string;
  doc_state: Uint8Array | null;
  sort_order: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

function withNoteMutation<T>(database: DatabaseSync, mutation: () => T): T {
  database.exec("SAVEPOINT note_mutation");
  try {
    const result = mutation();
    database.exec("RELEASE SAVEPOINT note_mutation");
    return result;
  } catch (error) {
    database.exec("ROLLBACK TO SAVEPOINT note_mutation");
    database.exec("RELEASE SAVEPOINT note_mutation");
    throw error;
  }
}

function mapNote(row: NoteRow): NoteRecord {
  return {
    id: row.id,
    parentId: row.parent_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    title: row.title,
    icon: row.icon,
    bodyMarkdown: row.body_markdown,
    sortOrder: row.sort_order,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(note: NoteRecord): NoteSummary {
  const { bodyMarkdown: _bodyMarkdown, ...summary } = note;
  return summary;
}

function getNote(database: DatabaseSync, id: string): NoteRecord | null {
  const row = database.prepare("SELECT * FROM notes WHERE id = ?").get(id) as
    | NoteRow
    | undefined;
  return row ? mapNote(row) : null;
}

function requireNote(database: DatabaseSync, id: string): NoteRecord {
  const note = getNote(database, id);
  if (!note) {
    throw new NoteNotFoundError(id);
  }
  return note;
}

function assertExpectedRevision(
  note: NoteRecord,
  expectedRevision?: number,
): void {
  if (expectedRevision !== undefined && note.revision !== expectedRevision) {
    throw new NoteConflictError();
  }
}

function setSubtreeWorkspace(
  database: DatabaseSync,
  rootId: string,
  workspaceId: string | null,
  updatedAt: string,
): void {
  database
    .prepare(
      `WITH RECURSIVE subtree(id) AS (
         SELECT id FROM notes WHERE parent_id = ?
         UNION ALL
         SELECT notes.id FROM notes
         JOIN subtree ON notes.parent_id = subtree.id
       )
       UPDATE notes
       SET workspace_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id IN (SELECT id FROM subtree)
         AND workspace_id IS NOT ?`,
    )
    .run(rootId, workspaceId, updatedAt, workspaceId);
}

function nextSortOrder(
  database: DatabaseSync,
  parentId: string | null,
): number {
  const row = database
    .prepare(
      `SELECT COALESCE(MAX(sort_order), -1000) + 1000 AS sort_order
       FROM notes
       WHERE parent_id IS ?`,
    )
    .get(parentId) as { sort_order?: number } | undefined;
  return row?.sort_order ?? 0;
}

function assertMoveDoesNotCreateCycle(
  database: DatabaseSync,
  id: string,
  parentId: string | null,
): void {
  if (!parentId) {
    return;
  }
  const cycle = database
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM notes WHERE parent_id = ?
         UNION ALL
         SELECT notes.id
         FROM notes
         JOIN descendants ON notes.parent_id = descendants.id
       )
       SELECT id FROM descendants WHERE id = ?`,
    )
    .get(id, parentId);
  if (id === parentId || cycle) {
    throw new Error("Cannot move a note into its own descendant");
  }
}

function requireDocState(database: DatabaseSync, note: NoteRecord) {
  const row = database
    .prepare("SELECT doc_state FROM notes WHERE id = ?")
    .get(note.id) as Pick<NoteRow, "doc_state"> | undefined;
  if (row?.doc_state) {
    return row.doc_state;
  }
  const state = createNoteDocState(note.bodyMarkdown);
  database
    .prepare("UPDATE notes SET doc_state = ? WHERE id = ?")
    .run(state, note.id);
  return state;
}

interface NextBody {
  markdown: string;
  state: Uint8Array | null;
}

function nextBody(
  database: DatabaseSync,
  current: NoteRecord,
  bodyMarkdown: string | undefined,
): NextBody | null {
  if (bodyMarkdown === undefined) {
    return null;
  }
  if (current.kind !== "note") {
    return { markdown: bodyMarkdown, state: null };
  }
  return applyMarkdownToNoteDoc(
    requireDocState(database, current),
    bodyMarkdown,
  );
}

function updateNote(
  database: DatabaseSync,
  payload: UpdateNotePayload,
): NoteRecord {
  const current = requireNote(database, payload.id);
  assertExpectedRevision(current, payload.expectedRevision);
  const body = nextBody(database, current, payload.bodyMarkdown);
  const updatedAt = new Date().toISOString();
  const result = database
    .prepare(
      `UPDATE notes
       SET title = ?,
           icon = ?,
           body_markdown = ?,
           doc_state = COALESCE(?, doc_state),
           workspace_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .run(
      payload.title?.trim() || current.title,
      payload.icon !== undefined ? payload.icon : current.icon,
      body?.markdown ?? current.bodyMarkdown,
      body?.state ?? null,
      payload.workspaceId !== undefined
        ? payload.workspaceId
        : current.workspaceId,
      updatedAt,
      current.id,
      current.revision,
    );
  if (result.changes !== 1) {
    throw new NoteConflictError();
  }
  if (payload.workspaceId !== undefined) {
    setSubtreeWorkspace(database, current.id, payload.workspaceId, updatedAt);
  }
  syncNoteMetadata(database, current.id);
  resolveLinksFromSource(database, current.id);
  const updated = requireNote(database, current.id);
  if (updated.title !== current.title) {
    resolveWikilinksToTitles(database, [current.title, updated.title]);
  }
  return updated;
}

function applyDocUpdate(
  database: DatabaseSync,
  id: string,
  update: Uint8Array,
): NoteDocApplyResult {
  const current = requireNote(database, id);
  if (current.kind !== "note") {
    throw new Error("Folders have no document body");
  }
  const change = applyNoteDocUpdate(requireDocState(database, current), update);
  if (!change.changed) {
    return { note: current, changed: false };
  }
  database
    .prepare(
      `UPDATE notes
       SET body_markdown = ?,
           doc_state = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ?`,
    )
    .run(change.markdown, change.state, new Date().toISOString(), id);
  syncNoteMetadata(database, id);
  resolveLinksFromSource(database, id);
  return { note: requireNote(database, id), changed: true };
}

function syncNoteMetadata(database: DatabaseSync, noteId: string): void {
  const note = requireNote(database, noteId);
  database.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
  database
    .prepare("DELETE FROM note_links WHERE source_note_id = ?")
    .run(noteId);
  if (note.kind !== "note") {
    deleteUnusedTags(database);
    return;
  }

  const metadata = extractNoteMetadata(note.bodyMarkdown);
  const now = new Date().toISOString();
  const insertTag = database.prepare(
    `INSERT INTO tags (id, name, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO NOTHING`,
  );
  const findTag = database.prepare("SELECT id FROM tags WHERE name = ?");
  const linkTag = database.prepare(
    `INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)`,
  );
  for (const name of metadata.tags) {
    insertTag.run(crypto.randomUUID(), name, now);
    const tag = findTag.get(name) as { id?: string } | undefined;
    if (tag?.id) {
      linkTag.run(noteId, tag.id);
    }
  }

  const insertLink = database.prepare(
    `INSERT INTO note_links (
       source_note_id, target_note_id, target_ref, kind, created_at
     ) VALUES (?, NULL, ?, ?, ?)`,
  );
  for (const link of metadata.links) {
    insertLink.run(noteId, link.targetRef, link.kind, now);
  }
  deleteUnusedTags(database);
}

const RESOLVE_LINK_TARGET_SQL = `
  UPDATE note_links
  SET target_note_id = CASE
    WHEN kind = 'markdown' THEN (
      SELECT notes.id
      FROM notes
      WHERE notes.id = note_links.target_ref
        AND notes.kind = 'note'
    )
    ELSE (
      SELECT notes.id
      FROM notes
      WHERE notes.kind = 'note'
        AND notes.title = note_links.target_ref COLLATE NOCASE
      ORDER BY notes.created_at, notes.rowid
      LIMIT 1
    )
  END`;

function resolveLinksFromSource(database: DatabaseSync, noteId: string): void {
  database
    .prepare(`${RESOLVE_LINK_TARGET_SQL} WHERE source_note_id = ?`)
    .run(noteId);
}

function resolveWikilinksToTitles(
  database: DatabaseSync,
  titles: readonly string[],
): void {
  const resolve = database.prepare(
    `${RESOLVE_LINK_TARGET_SQL}
     WHERE kind = 'wikilink' AND target_ref = ? COLLATE NOCASE`,
  );
  for (const title of new Set(titles)) {
    resolve.run(title);
  }
}

function deleteUnusedTags(database: DatabaseSync): void {
  database.exec(
    "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)",
  );
}

export function createSqliteNotesRepository(
  database: DatabaseSync,
): NotesRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT ${NOTE_SUMMARY_COLUMNS} FROM notes
           ORDER BY parent_id IS NOT NULL, parent_id, sort_order, title, id`,
        )
        .all() as NoteRow[];
      return rows.map(mapNote).map(toSummary);
    },
    async get(id) {
      return getNote(database, id);
    },
    async getDoc(id, stateVector) {
      return withNoteMutation(database, (): NoteDocRecord | null => {
        const note = requireNote(database, id);
        if (note.kind !== "note") {
          return null;
        }
        const state = requireDocState(database, note);
        return {
          id: note.id,
          revision: note.revision,
          update: diffNoteDoc(state, stateVector),
        };
      });
    },
    async applyDocUpdate(payload) {
      return withNoteMutation(database, () =>
        applyDocUpdate(database, payload.id, payload.update),
      );
    },
    async create(payload: CreateNotePayload) {
      return withNoteMutation(database, () => {
        const parentId = payload.parentId ?? null;
        const workspaceId = parentId
          ? requireNote(database, parentId).workspaceId
          : (payload.workspaceId ?? null);
        const kind = payload.kind ?? "note";
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const docState =
          kind === "note"
            ? createNoteDocState(payload.bodyMarkdown ?? "")
            : null;
        database
          .prepare(
            `INSERT INTO notes (
               id, parent_id, workspace_id, kind, title, icon, body_markdown,
               doc_state, sort_order, revision, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .run(
            id,
            parentId,
            workspaceId,
            kind,
            payload.title?.trim() ||
              (kind === "folder" ? "Folder" : "Untitled"),
            payload.icon ?? null,
            docState ? noteDocToMarkdown(docState) : "",
            docState,
            payload.sortOrder ?? nextSortOrder(database, parentId),
            now,
            now,
          );
        syncNoteMetadata(database, id);
        resolveLinksFromSource(database, id);
        const created = requireNote(database, id);
        resolveWikilinksToTitles(database, [created.title]);
        return created;
      });
    },
    async update(payload) {
      return withNoteMutation(database, () => updateNote(database, payload));
    },
    async move(payload) {
      return withNoteMutation(database, () => {
        const current = requireNote(database, payload.id);
        assertExpectedRevision(current, payload.expectedRevision);
        assertMoveDoesNotCreateCycle(database, payload.id, payload.parentId);
        const workspaceId = payload.parentId
          ? requireNote(database, payload.parentId).workspaceId
          : payload.workspaceId !== undefined
            ? payload.workspaceId
            : current.workspaceId;
        const updatedAt = new Date().toISOString();
        const result = database
          .prepare(
            `UPDATE notes
             SET parent_id = ?,
                 workspace_id = ?,
                 sort_order = ?,
                 revision = revision + 1,
                 updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            payload.parentId,
            workspaceId,
            payload.sortOrder ?? nextSortOrder(database, payload.parentId),
            updatedAt,
            current.id,
            current.revision,
          );
        if (result.changes !== 1) {
          throw new NoteConflictError();
        }
        setSubtreeWorkspace(database, current.id, workspaceId, updatedAt);
        return requireNote(database, current.id);
      });
    },
    async delete(payload) {
      withNoteMutation(database, () => {
        const current = requireNote(database, payload.id);
        assertExpectedRevision(current, payload.expectedRevision);
        const removedTitles = (
          database
            .prepare(
              `WITH RECURSIVE subtree(id) AS (
                 SELECT ?
                 UNION ALL
                 SELECT notes.id FROM notes
                 JOIN subtree ON notes.parent_id = subtree.id
               )
               SELECT title FROM notes
               WHERE id IN (SELECT id FROM subtree) AND kind = 'note'`,
            )
            .all(current.id) as Array<{ title: string }>
        ).map((row) => row.title);
        const result = database
          .prepare("DELETE FROM notes WHERE id = ? AND revision = ?")
          .run(current.id, current.revision);
        if (result.changes !== 1) {
          throw new NoteConflictError();
        }
        resolveWikilinksToTitles(database, removedTitles);
        deleteUnusedTags(database);
      });
    },
    async listTags(noteId) {
      const rows = noteId
        ? database
            .prepare(
              `SELECT tags.id, tags.name
               FROM tags
               JOIN note_tags ON note_tags.tag_id = tags.id
               WHERE note_tags.note_id = ?
               ORDER BY tags.name`,
            )
            .all(noteId)
        : database.prepare("SELECT id, name FROM tags ORDER BY name").all();
      return rows as unknown as NoteTag[];
    },
    async listBacklinks(payload) {
      const rows = database
        .prepare(
          `SELECT source_note_id, target_note_id, target_ref, kind
           FROM note_links
           WHERE target_note_id = ?
           ORDER BY source_note_id,
             CASE kind WHEN 'wikilink' THEN 0 ELSE 1 END,
             target_ref`,
        )
        .all(payload.id) as Array<{
        source_note_id: string;
        target_note_id: string | null;
        target_ref: string;
        kind: NoteLink["kind"];
      }>;
      return rows.map((row) => ({
        sourceNoteId: row.source_note_id,
        targetNoteId: row.target_note_id,
        targetRef: row.target_ref,
        kind: row.kind,
      }));
    },
  };
}
