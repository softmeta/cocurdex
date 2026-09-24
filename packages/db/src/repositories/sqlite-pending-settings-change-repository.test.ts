import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createSchemaSql } from "../schema";
import { createSqlitePendingSettingsChangeRepository } from "./sqlite-pending-settings-change-repository";

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(createSchemaSql());
  return database;
}

describe("createSqlitePendingSettingsChangeRepository", () => {
  it("round-trips queued changes in insertion order", async () => {
    const database = createDatabase();
    const changes = createSqlitePendingSettingsChangeRepository(database);

    await changes.add({
      id: "change-2",
      key: "app.language",
      value: "zh-CN",
      createdAt: "2026-09-24T00:00:01.000Z",
    });
    await changes.add({
      id: "change-1",
      key: "app.theme",
      value: "dark",
      createdAt: "2026-09-24T00:00:00.000Z",
    });

    expect(await changes.list()).toEqual([
      {
        id: "change-1",
        key: "app.theme",
        value: "dark",
        createdAt: "2026-09-24T00:00:00.000Z",
      },
      {
        id: "change-2",
        key: "app.language",
        value: "zh-CN",
        createdAt: "2026-09-24T00:00:01.000Z",
      },
    ]);
  });

  it("preserves structured values and deletes acknowledged changes", async () => {
    const database = createDatabase();
    const changes = createSqlitePendingSettingsChangeRepository(database);

    await changes.add({
      id: "change-1",
      key: "app.notifications",
      value: { systemNotifications: false, completionSound: true },
      createdAt: "2026-09-24T00:00:00.000Z",
    });
    await changes.add({
      id: "change-2",
      key: "app.theme",
      value: "light",
      createdAt: "2026-09-24T00:00:01.000Z",
    });

    expect((await changes.list())[0]?.value).toEqual({
      systemNotifications: false,
      completionSound: true,
    });

    await changes.delete("change-1");
    expect((await changes.list()).map((change) => change.id)).toEqual([
      "change-2",
    ]);
  });
});
