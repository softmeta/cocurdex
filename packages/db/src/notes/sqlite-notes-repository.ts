import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
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
  NoteNotFoundError,
  type NotesRepository,
} from "./notes-repository";

interface NoteRow extends SqliteRow {
  id: string;
  parent_id: string | null;
  workspace_id: string | null;
  kind: NoteKind;
  title: string;
  icon: string | null;
  body_markdown: string;
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

function assertParentFolder(
  database: DatabaseSync,
  parentId: string | null | undefined,
): void {
  if (!parentId) {
    return;
  }
  const parent = requireNote(database, parentId);
  if (parent.kind !== "folder") {
    throw new Error("Note parent must be a folder");
  }
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
    throw new Error("Cannot move a folder into its own descendant");
  }
}

function updateNote(
  database: DatabaseSync,
  payload: UpdateNotePayload,
): NoteRecord {
  const current = requireNote(database, payload.id);
  assertExpectedRevision(current, payload.expectedRevision);
  const updatedAt = new Date().toISOString();
  const result = database
    .prepare(
      `UPDATE notes
       SET title = ?,
           icon = ?,
           body_markdown = ?,
           workspace_id = ?,
           revision = revision + 1,
           updated_at = ?
       WHERE id = ? AND revision = ?`,
    )
    .run(
      payload.title ?? current.title,
      payload.icon !== undefined ? payload.icon : current.icon,
      payload.bodyMarkdown ?? current.bodyMarkdown,
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
  syncNoteMetadata(database, current.id);
  resolveNoteLinkTargets(database);
  return requireNote(database, current.id);
}

function syncNoteMetadata(database: DatabaseSync, noteId: string): void {
  const note = requireNote(database, noteId);
  database.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
  database
    .prepare("DELETE FROM note_links WHERE source_note_id = ?")
    .run(noteId);
  if (note.kind !== "note") {
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
}

function resolveNoteLinkTargets(database: DatabaseSync): void {
  database.exec(`
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
        ORDER BY notes.created_at, notes.id
        LIMIT 1
      )
    END;
  `);
}

export function createSqliteNotesRepository(
  database: DatabaseSync,
): NotesRepository {
  return {
    async list() {
      const rows = database
        .prepare(
          `SELECT * FROM notes
           ORDER BY parent_id IS NOT NULL, parent_id, sort_order, title, id`,
        )
        .all() as NoteRow[];
      return rows.map(mapNote).map(toSummary);
    },
    async get(id) {
      return getNote(database, id);
    },
    async create(payload: CreateNotePayload) {
      return withNoteMutation(database, () => {
        const parentId = payload.parentId ?? null;
        assertParentFolder(database, parentId);
        const kind = payload.kind ?? "note";
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        database
          .prepare(
            `INSERT INTO notes (
               id, parent_id, workspace_id, kind, title, icon, body_markdown,
               sort_order, revision, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, '', ?, 1, ?, ?)`,
          )
          .run(
            id,
            parentId,
            payload.workspaceId ?? null,
            kind,
            payload.title?.trim() ||
              (kind === "folder" ? "Folder" : "Untitled"),
            payload.icon ?? null,
            payload.sortOrder ?? nextSortOrder(database, parentId),
            now,
            now,
          );
        resolveNoteLinkTargets(database);
        return requireNote(database, id);
      });
    },
    async update(payload) {
      return withNoteMutation(database, () => updateNote(database, payload));
    },
    async rename(payload) {
      return withNoteMutation(database, () =>
        updateNote(database, {
          id: payload.id,
          title: payload.title,
          expectedRevision: payload.expectedRevision,
        }),
      );
    },
    async move(payload) {
      return withNoteMutation(database, () => {
        const current = requireNote(database, payload.id);
        assertExpectedRevision(current, payload.expectedRevision);
        assertParentFolder(database, payload.parentId);
        assertMoveDoesNotCreateCycle(database, payload.id, payload.parentId);
        const updatedAt = new Date().toISOString();
        const result = database
          .prepare(
            `UPDATE notes
             SET parent_id = ?,
                 sort_order = ?,
                 revision = revision + 1,
                 updated_at = ?
             WHERE id = ? AND revision = ?`,
          )
          .run(
            payload.parentId,
            payload.sortOrder ?? nextSortOrder(database, payload.parentId),
            updatedAt,
            current.id,
            current.revision,
          );
        if (result.changes !== 1) {
          throw new NoteConflictError();
        }
        resolveNoteLinkTargets(database);
        return requireNote(database, current.id);
      });
    },
    async delete(payload) {
      const current = requireNote(database, payload.id);
      assertExpectedRevision(current, payload.expectedRevision);
      const result = database
        .prepare("DELETE FROM notes WHERE id = ? AND revision = ?")
        .run(current.id, current.revision);
      if (result.changes !== 1) {
        throw new NoteConflictError();
      }
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
