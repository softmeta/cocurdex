import { DatabaseSync } from "node:sqlite";
import { DURABLE_TABLE_PREFIX } from "@cocurdex/agent-adapters";
import { createDurableStore } from "@cocurdex/db";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { SqliteStorage } from "@earendil-works/pi-durable/storage/sqlite";
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { describe, expect, it } from "vitest";

registerStorageConformance(
  { describe, expect, it },
  "pi-durable storage on Cocurdex's shared connection",
  async (use) => {
    const database = new DatabaseSync(":memory:");
    const storage = await SqliteStorage.open(
      createDurableStore(database).open(),
      { prefix: DURABLE_TABLE_PREFIX },
    );
    try {
      await use(storage);
    } finally {
      await storage.close(BACKGROUND_CONTEXT);
      database.close();
    }
  },
);
