import { DatabaseSync } from "node:sqlite";
import { createSqliteMemoryEntriesRepository } from "@cocurdex/db";
import { initializeDatabase } from "@cocurdex/db/internal/migrations";

/** The daemon's memory tables on an in-memory database. */
export function createMemoryStore() {
  const database = new DatabaseSync(":memory:");
  initializeDatabase(database);
  return {
    entries: createSqliteMemoryEntriesRepository(database),
    transaction<T>(run: () => T): T {
      database.exec("BEGIN");
      try {
        const result = run();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
