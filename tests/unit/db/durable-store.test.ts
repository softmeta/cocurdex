import { DatabaseSync } from "node:sqlite";
import { createDurableStore } from "@cocurdex/db";
import { describe, expect, it } from "vitest";

function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE app (v TEXT); CREATE TABLE durable (v INTEGER)");
  const rows = (table: string) =>
    database
      .prepare(`SELECT v FROM ${table}`)
      .all()
      .map((row) => row.v);
  return { database, handle: createDurableStore(database).open(), rows };
}

describe("durable store on the shared connection", () => {
  it("keeps Cocurdex writes made while a failing durable transaction was open", async () => {
    const { database, handle, rows } = setup();
    const failure = new Error("durable commit failed");

    await expect(
      handle.transaction(async (transaction) => {
        await transaction.run("INSERT INTO durable VALUES (?)", 1);
        await Promise.resolve();
        database.prepare("INSERT INTO app VALUES ('kept')").run();
        await transaction.run("INSERT INTO durable VALUES (?)", 2);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(rows("app")).toEqual(["kept"]);
    expect(rows("durable")).toEqual([]);
    expect(database.isTransaction).toBe(false);
  });

  it("reads its own writes inside a transaction and commits them together", async () => {
    const { database, handle, rows } = setup();

    const seen = await handle.transaction(async (transaction) => {
      await transaction.run("INSERT INTO durable VALUES (?)", 1);
      const inside = await transaction.get<{ n: number }>(
        "SELECT count(*) AS n FROM durable",
      );
      database.prepare("INSERT INTO app VALUES ('between')").run();
      expect(rows("durable")).toEqual([]);
      const changed = await transaction.runCounted(
        "UPDATE durable SET v = v + 1",
      );
      return { inside: inside?.n, changed };
    });

    expect(seen).toEqual({ inside: 1, changed: 1 });
    expect(rows("durable")).toEqual([2]);
    expect(rows("app")).toEqual(["between"]);
  });
});
