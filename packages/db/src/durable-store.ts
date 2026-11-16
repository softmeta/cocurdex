import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";
import { ReasonError } from "@cocurdex/shared";

export type DurableSqliteValue = null | number | bigint | string | Uint8Array;

export interface DurableSqliteExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: DurableSqliteValue[]): Promise<void>;
  runCounted(sql: string, ...params: DurableSqliteValue[]): Promise<number>;
  get<T extends object>(
    sql: string,
    ...params: DurableSqliteValue[]
  ): Promise<T | undefined>;
  all<T extends object>(
    sql: string,
    ...params: DurableSqliteValue[]
  ): Promise<T[]>;
}

export interface DurableSqliteDatabase extends DurableSqliteExecutor {
  transaction<T>(
    callback: (transaction: DurableSqliteExecutor) => Promise<T>,
  ): Promise<T>;
  close(): Promise<void>;
}

/** Pi-durable's storage, kept in cocurdex.sqlite under its own table prefix. */
export interface DurableStore {
  /** A handle for one pi-durable storage; closing it leaves cocurdex.sqlite open. */
  open(): DurableSqliteDatabase;
  hasTable(name: string): boolean;
  /**
   * Replaces the rows of every `<prefix><table>` with those of `<table>` in the SQLite file at
   * `sourcePath`, in one transaction. Each target table must already exist.
   */
  importTables(sourcePath: string, prefix: string): void;
}

interface Write {
  sql: string;
  params: DurableSqliteValue[];
}

/**
 * Pi-durable's storage awaits between statements inside a transaction. On the connection
 * Cocurdex shares, an open transaction would take in whatever Cocurdex writes run in those
 * gaps, and roll them back with it. So a transaction here collects its writes and applies them
 * in one synchronous BEGIN...COMMIT once its callback resolves; nothing else can run in between.
 * Reads run at once: only pi-durable writes its tables, and its operations run one at a time,
 * so a transaction reads the state it started from. A read after one of its own writes runs in
 * a synchronous BEGIN...ROLLBACK that replays those writes first.
 */
class DurableSqliteHandle implements DurableSqliteDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly database: DatabaseSync,
    private readonly statement: (sql: string) => StatementSync,
  ) {}

  exec(sql: string) {
    return this.queue(() => {
      this.database.exec(sql);
    });
  }

  run(sql: string, ...params: DurableSqliteValue[]) {
    return this.queue(() => {
      this.statement(sql).run(...(params as SQLInputValue[]));
    });
  }

  runCounted(sql: string, ...params: DurableSqliteValue[]) {
    return this.queue(() =>
      Number(this.statement(sql).run(...(params as SQLInputValue[])).changes),
    );
  }

  get<T extends object>(sql: string, ...params: DurableSqliteValue[]) {
    return this.queue(
      () =>
        this.statement(sql).get(...(params as SQLInputValue[])) as
          | T
          | undefined,
    );
  }

  all<T extends object>(sql: string, ...params: DurableSqliteValue[]) {
    return this.queue(
      () => this.statement(sql).all(...(params as SQLInputValue[])) as T[],
    );
  }

  transaction<T>(callback: (transaction: DurableSqliteExecutor) => Promise<T>) {
    return this.queue(async () => {
      const writes: Write[] = [];
      const scope = { active: true };
      let result: T;
      try {
        result = await callback(this.transactionHandle(writes, scope));
      } finally {
        scope.active = false;
      }
      if (writes.length > 0) {
        this.atomically(() => {
          this.apply(writes);
          return true;
        }, "COMMIT");
      }
      return result;
    });
  }

  async close() {
    this.closed = true;
    await this.tail.catch(() => undefined);
  }

  private transactionHandle(
    writes: Write[],
    scope: { active: boolean },
  ): DurableSqliteExecutor {
    const live = <R>(operation: () => R) => {
      if (!scope.active) {
        return Promise.reject(
          new ReasonError(
            "durableStore.transactionFinished",
            "The durable SQLite transaction already finished",
          ),
        );
      }
      return Promise.resolve().then(operation);
    };
    const read = <R>(operation: () => R) =>
      live(() =>
        writes.length === 0
          ? operation()
          : this.atomically(() => {
              this.apply(writes);
              return operation();
            }, "ROLLBACK"),
      );
    return {
      exec: (sql) =>
        live(() => {
          writes.push({ sql, params: [] });
        }),
      run: (sql, ...params) =>
        live(() => {
          writes.push({ sql, params });
        }),
      runCounted: (sql, ...params) =>
        read(() => {
          const changes = Number(
            this.statement(sql).run(...(params as SQLInputValue[])).changes,
          );
          writes.push({ sql, params });
          return changes;
        }),
      get: <R extends object>(sql: string, ...params: DurableSqliteValue[]) =>
        read(
          () =>
            this.statement(sql).get(...(params as SQLInputValue[])) as
              | R
              | undefined,
        ),
      all: <R extends object>(sql: string, ...params: DurableSqliteValue[]) =>
        read(
          () => this.statement(sql).all(...(params as SQLInputValue[])) as R[],
        ),
    };
  }

  private apply(writes: readonly Write[]) {
    for (const write of writes) {
      if (write.params.length === 0) this.database.exec(write.sql);
      else this.statement(write.sql).run(...(write.params as SQLInputValue[]));
    }
  }

  private atomically<R>(operation: () => R, end: "COMMIT" | "ROLLBACK"): R {
    if (this.database.isTransaction) {
      throw new ReasonError(
        "durableStore.nestedTransaction",
        "A durable SQLite transaction cannot start inside another transaction",
      );
    }
    this.database.exec("BEGIN");
    try {
      const result = operation();
      this.database.exec(end);
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private queue<R>(operation: () => R | Promise<R>): Promise<R> {
    if (this.closed) {
      return Promise.reject(
        new ReasonError(
          "durableStore.closed",
          "The durable SQLite handle is closed",
        ),
      );
    }
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function quoteIdentifier(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}

function columnNames(database: DatabaseSync, schema: string, table: string) {
  return (
    database
      .prepare(`PRAGMA ${schema}.table_info(${quoteIdentifier(table)})`)
      .all() as { name: string }[]
  ).map((column) => column.name);
}

const IMPORT_SCHEMA = "durable_import";

export function createDurableStore(database: DatabaseSync): DurableStore {
  const statements = new Map<string, StatementSync>();
  const statement = (sql: string) => {
    let prepared = statements.get(sql);
    if (!prepared) {
      prepared = database.prepare(sql);
      statements.set(sql, prepared);
    }
    return prepared;
  };
  const hasTable = (name: string) =>
    database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(name) !== undefined;

  return {
    open: () => new DurableSqliteHandle(database, statement),
    hasTable,
    importTables(sourcePath, prefix) {
      database.prepare(`ATTACH DATABASE ? AS ${IMPORT_SCHEMA}`).run(sourcePath);
      try {
        const tables = (
          database
            .prepare(
              `SELECT name FROM ${IMPORT_SCHEMA}.sqlite_master
               WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
            )
            .all() as { name: string }[]
        ).map((row) => row.name);
        database.exec("BEGIN");
        try {
          for (const table of tables) {
            const target = `${prefix}${table}`;
            if (!hasTable(target)) {
              throw new ReasonError(
                "durableStore.importTargetMissing",
                `Durable import target ${target} does not exist`,
              );
            }
            const targetColumns = new Set(
              columnNames(database, "main", target),
            );
            const columns = columnNames(database, IMPORT_SCHEMA, table)
              .filter((column) => targetColumns.has(column))
              .map(quoteIdentifier)
              .join(", ");
            database.exec(`DELETE FROM main.${quoteIdentifier(target)}`);
            database.exec(
              `INSERT INTO main.${quoteIdentifier(target)} (${columns})
               SELECT ${columns} FROM ${IMPORT_SCHEMA}.${quoteIdentifier(table)}`,
            );
          }
          database.exec("COMMIT");
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      } finally {
        database.exec(`DETACH DATABASE ${IMPORT_SCHEMA}`);
      }
    },
  };
}
