import { DatabaseSync } from "node:sqlite";
import {
  COCURDEX_APPLICATION_ID,
  CURRENT_SCHEMA_VERSION,
  FIRST_MIGRATABLE_SCHEMA_VERSION,
  initializeDatabase,
} from "@cocurdex/db/internal/migrations";
import {
  historicalSchemaVersions,
  seedHistoricalDatabase,
} from "@cocurdex/test-fixtures/database";
import { describe, expect, it } from "vitest";

interface SchemaObjectRow {
  type: string;
  name: string;
  tbl_name: string;
}

interface ColumnRow {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
  hidden: number;
}

interface ForeignKeyRow {
  from: string;
  table: string;
  to: string;
  on_update: string;
  on_delete: string;
}

function describeSchema(database: DatabaseSync) {
  const objects = database
    .prepare(
      `SELECT type, name, tbl_name FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name`,
    )
    .all() as unknown as SchemaObjectRow[];
  return Object.fromEntries(
    objects.map((object) => {
      const key = `${object.type} ${object.name}`;
      if (object.type !== "table") return [key, object.tbl_name];
      const quoted = JSON.stringify(object.name);
      const columns = database
        .prepare(`PRAGMA table_xinfo(${quoted})`)
        .all() as unknown as ColumnRow[];
      const foreignKeys = database
        .prepare(`PRAGMA foreign_key_list(${quoted})`)
        .all() as unknown as ForeignKeyRow[];
      return [
        key,
        {
          columns: columns
            .map((column) => ({
              name: column.name,
              type: column.type,
              notNull: column.notnull,
              defaultValue: column.dflt_value,
              primaryKey: column.pk,
              hidden: column.hidden,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          foreignKeys: foreignKeys
            .map(
              (foreignKey) =>
                `${foreignKey.from} -> ${foreignKey.table}.${foreignKey.to} ` +
                `${foreignKey.on_update}/${foreignKey.on_delete}`,
            )
            .sort(),
        },
      ];
    }),
  );
}

function migrateHistoricalDatabase(version: number) {
  const database = new DatabaseSync(":memory:");
  seedHistoricalDatabase(database, version, "/acme-shop");
  expect(database.prepare("PRAGMA application_id").get()).toEqual({
    application_id: COCURDEX_APPLICATION_ID,
  });
  expect(database.prepare("PRAGMA user_version").get()).toEqual({
    user_version: version,
  });
  initializeDatabase(database);
  return database;
}

describe("historical schema fixtures", () => {
  it("cover every migratable schema version", () => {
    const expected = Array.from(
      { length: CURRENT_SCHEMA_VERSION - FIRST_MIGRATABLE_SCHEMA_VERSION },
      (_, index) => FIRST_MIGRATABLE_SCHEMA_VERSION + index,
    );
    expect(historicalSchemaVersions).toEqual(expected);
  });

  it.each(historicalSchemaVersions)(
    "preserves user data from schema %s",
    (version) => {
      const database = migrateHistoricalDatabase(version);
      try {
        expect(database.prepare("PRAGMA user_version").get()).toEqual({
          user_version: CURRENT_SCHEMA_VERSION,
        });
        expect(
          database.prepare("SELECT id, root_paths FROM workspaces").all(),
        ).toEqual([
          { id: "historical-workspace", root_paths: '["/acme-shop"]' },
        ]);
        expect(
          database.prepare("SELECT id, session_mode_id FROM sessions").all(),
        ).toEqual([{ id: "historical-session", session_mode_id: "plan" }]);
        expect(database.prepare("SELECT content FROM messages").all()).toEqual([
          { content: "Keep this conversation" },
        ]);
        expect(
          database.prepare("SELECT title, body_markdown FROM notes").all(),
        ).toEqual([
          { title: "Migration note", body_markdown: "Preserved note body" },
        ]);
        expect(
          database
            .prepare("SELECT title, description_markdown FROM issues")
            .all(),
        ).toEqual([
          {
            title: "Migration issue",
            description_markdown: "Preserved issue body",
          },
        ]);
        expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      } finally {
        database.close();
      }
    },
  );

  it.each(historicalSchemaVersions)(
    "migrates schema %s to the same structure as a fresh database",
    (version) => {
      const fresh = new DatabaseSync(":memory:");
      const migrated = migrateHistoricalDatabase(version);
      try {
        initializeDatabase(fresh);
        expect(describeSchema(migrated)).toEqual(describeSchema(fresh));
      } finally {
        fresh.close();
        migrated.close();
      }
    },
  );
});
