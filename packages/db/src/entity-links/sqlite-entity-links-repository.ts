import type { DatabaseSync } from "node:sqlite";
import {
  type EntityLink,
  type EntityLinkCandidate,
  type EntityLinkRelation,
  type EntityRef,
  entityUri,
  formatIssueIdentifier,
  type LinkableEntityKind,
  parseEntityRef,
  parseIssueNumber,
} from "@cocurdex/shared";
import type { EntityLinksRepository } from "./entity-links-repository";

const ENTITY_TABLES: Record<LinkableEntityKind, string> = {
  session: "sessions",
  note: "notes",
  issue: "issues",
  deck: "decks",
};

interface TitleRow {
  title: string;
  number?: number | null;
}

interface LinkedRef {
  ref: EntityRef;
  relation: EntityLinkRelation;
  removable: boolean;
}

function orderedPair(a: EntityRef, b: EntityRef): [EntityRef, EntityRef] {
  const aKey = `${a.kind}:${a.id}`;
  const bKey = `${b.kind}:${b.id}`;
  return aKey <= bKey ? [a, b] : [b, a];
}

const OPENABLE_FILTERS: Partial<Record<LinkableEntityKind, string>> = {
  session: "AND archived_at IS NULL",
};

function readTitle(database: DatabaseSync, ref: EntityRef, filter = "") {
  const columns = ref.kind === "issue" ? "title, number" : "title";
  return database
    .prepare(
      `SELECT ${columns} FROM ${ENTITY_TABLES[ref.kind]} WHERE id = ? ${filter}`,
    )
    .get(ref.id) as TitleRow | undefined;
}

function resolveRef(database: DatabaseSync, ref: EntityRef): EntityRef | null {
  if (readTitle(database, ref)) return ref;
  if (ref.kind !== "issue") return null;
  const number = parseIssueNumber(ref.id);
  if (number === null) return null;
  const row = database
    .prepare("SELECT id FROM issues WHERE number = ? ORDER BY rowid LIMIT 1")
    .get(number) as { id: string } | undefined;
  return row ? { kind: "issue", id: row.id } : null;
}

function manualLinks(database: DatabaseSync, ref: EntityRef): LinkedRef[] {
  const rows = database
    .prepare(
      `SELECT target_kind AS kind, target_id AS id, created_at FROM entity_links
       WHERE source_kind = ? AND source_id = ?
       UNION ALL
       SELECT source_kind AS kind, source_id AS id, created_at FROM entity_links
       WHERE target_kind = ? AND target_id = ?
       ORDER BY created_at`,
    )
    .all(ref.kind, ref.id, ref.kind, ref.id) as unknown as EntityRef[];
  return rows.map((row) => ({
    ref: { kind: row.kind, id: row.id },
    relation: "related",
    removable: true,
  }));
}

function noteMentions(database: DatabaseSync, ref: EntityRef): LinkedRef[] {
  if (ref.kind !== "note") return [];
  const rows = database
    .prepare(
      `SELECT target_note_id, target_ref FROM note_links
       WHERE source_note_id = ?
       ORDER BY rowid`,
    )
    .all(ref.id) as Array<{
    target_note_id: string | null;
    target_ref: string;
  }>;
  return rows.flatMap((row): LinkedRef[] => {
    const parsed = parseEntityRef(row.target_ref);
    const target = row.target_note_id
      ? ({ kind: "note", id: row.target_note_id } as const)
      : parsed && resolveRef(database, parsed);
    return target
      ? [{ ref: target, relation: "mentions", removable: false }]
      : [];
  });
}

function mentionedBy(database: DatabaseSync, ref: EntityRef): LinkedRef[] {
  const rows = database
    .prepare(
      `SELECT DISTINCT source_note_id FROM note_links
       WHERE target_ref = ? OR (? = 'note' AND target_note_id = ?)
       ORDER BY source_note_id`,
    )
    .all(entityUri(ref), ref.kind, ref.id) as Array<{
    source_note_id: string;
  }>;
  const sources = [
    ...rows.map((row) => row.source_note_id),
    ...issueIdentifierMentionSources(database, ref),
  ];
  return [...new Set(sources)].map((id) => ({
    ref: { kind: "note", id },
    relation: "mentioned-by",
    removable: false,
  }));
}

function issueIdentifierMentionSources(
  database: DatabaseSync,
  ref: EntityRef,
): string[] {
  if (ref.kind !== "issue") return [];
  const issue = readTitle(database, ref);
  if (typeof issue?.number !== "number") return [];
  const rows = database
    .prepare(
      `SELECT source_note_id, target_ref FROM note_links
       WHERE target_ref LIKE ? ORDER BY source_note_id`,
    )
    .all(`${entityUri({ kind: "issue", id: "" })}%`) as Array<{
    source_note_id: string;
    target_ref: string;
  }>;
  return rows
    .filter((row) => {
      const target = parseEntityRef(row.target_ref);
      return target !== null && parseIssueNumber(target.id) === issue.number;
    })
    .map((row) => row.source_note_id);
}

const ISSUE_RELATIONS: Record<
  string,
  { outgoing: EntityLinkRelation; incoming: EntityLinkRelation }
> = {
  blocks: { outgoing: "blocks", incoming: "blocked-by" },
  duplicate: { outgoing: "duplicate-of", incoming: "duplicated-by" },
  related: { outgoing: "related", incoming: "related" },
};

function issueRelations(database: DatabaseSync, ref: EntityRef): LinkedRef[] {
  if (ref.kind !== "issue") return [];
  const rows = database
    .prepare(
      `SELECT issue_id, related_issue_id, kind FROM issue_relations
       WHERE issue_id = ? OR related_issue_id = ?
       ORDER BY created_at, kind`,
    )
    .all(ref.id, ref.id) as Array<{
    issue_id: string;
    related_issue_id: string;
    kind: string;
  }>;
  const relations = rows.flatMap((row): LinkedRef[] => {
    const names = ISSUE_RELATIONS[row.kind];
    if (!names) return [];
    const outgoing = row.issue_id === ref.id;
    return [
      {
        ref: {
          kind: "issue",
          id: outgoing ? row.related_issue_id : row.issue_id,
        },
        relation: outgoing ? names.outgoing : names.incoming,
        removable: false,
      },
    ];
  });
  const parent = database
    .prepare("SELECT parent_id FROM issues WHERE id = ?")
    .get(ref.id) as { parent_id: string | null } | undefined;
  const children = database
    .prepare("SELECT id FROM issues WHERE parent_id = ? ORDER BY sort_order")
    .all(ref.id) as Array<{ id: string }>;
  return [
    ...(parent?.parent_id
      ? [
          {
            ref: { kind: "issue", id: parent.parent_id },
            relation: "parent",
            removable: false,
          } satisfies LinkedRef,
        ]
      : []),
    ...children.map(
      (child): LinkedRef => ({
        ref: { kind: "issue", id: child.id },
        relation: "child",
        removable: false,
      }),
    ),
    ...relations,
  ];
}

function issueSessions(database: DatabaseSync, ref: EntityRef): LinkedRef[] {
  if (ref.kind === "issue") {
    const rows = database
      .prepare(
        "SELECT session_id FROM issue_sessions WHERE issue_id = ? ORDER BY linked_at",
      )
      .all(ref.id) as Array<{ session_id: string }>;
    return rows.map((row) => ({
      ref: { kind: "session", id: row.session_id },
      relation: "worked-on-by",
      removable: false,
    }));
  }
  if (ref.kind === "session") {
    const rows = database
      .prepare(
        "SELECT issue_id FROM issue_sessions WHERE session_id = ? ORDER BY linked_at",
      )
      .all(ref.id) as Array<{ issue_id: string }>;
    return rows.map((row) => ({
      ref: { kind: "issue", id: row.issue_id },
      relation: "works-on",
      removable: false,
    }));
  }
  return [];
}

function toEntityLink(
  database: DatabaseSync,
  linked: LinkedRef,
): EntityLink | null {
  const row = readTitle(
    database,
    linked.ref,
    OPENABLE_FILTERS[linked.ref.kind],
  );
  if (!row) return null;
  return {
    target: linked.ref,
    title: row.title,
    detail:
      typeof row.number === "number" ? formatIssueIdentifier(row.number) : null,
    relation: linked.relation,
    removable: linked.removable,
  };
}

const SESSION_CANDIDATE_LIMIT = 200;

const CANDIDATE_QUERIES: Record<LinkableEntityKind, string> = {
  session: `SELECT id, title, NULL AS number FROM sessions
    WHERE archived_at IS NULL AND parent_session_id IS NULL
    ORDER BY updated_at DESC LIMIT ${SESSION_CANDIDATE_LIMIT}`,
  note: `SELECT id, title, NULL AS number FROM notes
    WHERE kind = 'note' ORDER BY updated_at DESC`,
  issue: "SELECT id, title, number FROM issues ORDER BY updated_at DESC",
  deck: "SELECT id, title, NULL AS number FROM decks ORDER BY updated_at DESC",
};

function listCandidates(database: DatabaseSync): EntityLinkCandidate[] {
  return (Object.keys(CANDIDATE_QUERIES) as LinkableEntityKind[]).flatMap(
    (kind) => {
      const rows = database.prepare(CANDIDATE_QUERIES[kind]).all() as Array<{
        id: string;
        title: string;
        number: number | null;
      }>;
      return rows.map((row) => ({
        target: { kind, id: row.id },
        title: row.title,
        detail:
          typeof row.number === "number"
            ? formatIssueIdentifier(row.number)
            : null,
      }));
    },
  );
}

export function createSqliteEntityLinksRepository(
  database: DatabaseSync,
): EntityLinksRepository {
  return {
    async resolve(ref) {
      return resolveRef(database, ref);
    },
    async list(ref) {
      const linked = [
        ...manualLinks(database, ref),
        ...noteMentions(database, ref),
        ...mentionedBy(database, ref),
        ...issueRelations(database, ref),
        ...issueSessions(database, ref),
      ];
      const seen = new Set<string>();
      return linked.flatMap((item) => {
        const key = `${item.relation}:${item.ref.kind}:${item.ref.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        if (item.ref.kind === ref.kind && item.ref.id === ref.id) return [];
        const link = toEntityLink(database, item);
        return link ? [link] : [];
      });
    },
    async candidates() {
      return listCandidates(database);
    },
    async add(source, target) {
      const [first, second] = orderedPair(source, target);
      const result = database
        .prepare(
          `INSERT INTO entity_links (
             source_kind, source_id, target_kind, target_id, created_at
           ) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
        )
        .run(
          first.kind,
          first.id,
          second.kind,
          second.id,
          new Date().toISOString(),
        );
      return Number(result.changes) > 0;
    },
    async remove(source, target) {
      const [first, second] = orderedPair(source, target);
      const result = database
        .prepare(
          `DELETE FROM entity_links
           WHERE source_kind = ? AND source_id = ?
             AND target_kind = ? AND target_id = ?`,
        )
        .run(first.kind, first.id, second.kind, second.id);
      return Number(result.changes) > 0;
    },
  };
}
