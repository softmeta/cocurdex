import path from "node:path";
import { createCommandReceiptLog } from "@cocurdex/daemon/internal/command-receipt-log";
import { createDaemonReceiptStore } from "@cocurdex/daemon/internal/rpc-receipts";
import { createCocurdexDatabase } from "@cocurdex/db";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it, vi } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

function openReceipts() {
  const databasePath = path.join(
    tempDirs.createSync("receipts-"),
    "cocurdex.sqlite",
  );
  const database = createCocurdexDatabase(databasePath);
  return { database, databasePath };
}

function storeFor(database: ReturnType<typeof createCocurdexDatabase>) {
  const log = createCommandReceiptLog(async () => database.commandReceipts);
  return createDaemonReceiptStore({ durableLog: () => log });
}

describe("durable command receipts", () => {
  it("replays a successful mutation after the in-memory store is gone", async () => {
    const { database, databasePath } = openReceipts();
    const run = vi.fn(async () => ({
      ok: true as const,
      result: { id: "note-1" },
    }));
    await storeFor(database).execute("local:note.create:k1", run, {
      durable: true,
    });
    database.close();

    const reopened = createCocurdexDatabase(databasePath);
    const replay = await storeFor(reopened).execute(
      "local:note.create:k1",
      run,
      { durable: true },
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(replay).toEqual({
      outcome: { ok: true, result: { id: "note-1" } },
      replayed: true,
    });
    reopened.close();
  });

  it("runs again after a failure or a read that was not persisted", async () => {
    const { database } = openReceipts();
    const failing = vi.fn(async () => ({
      ok: false as const,
      error: { code: "REQUEST_FAILED", message: "Daemon is shutting down" },
    }));
    const reading = vi.fn(async () => ({ ok: true as const, result: [] }));
    await storeFor(database).execute("local:note.create:k2", failing, {
      durable: true,
    });
    await storeFor(database).execute("local:note.list:k3", reading);

    await storeFor(database).execute("local:note.create:k2", failing, {
      durable: true,
    });
    await storeFor(database).execute("local:note.list:k3", reading);

    expect(failing).toHaveBeenCalledTimes(2);
    expect(reading).toHaveBeenCalledTimes(2);
    database.close();
  });

  it("keeps the first outcome when a key is written twice", async () => {
    const { database } = openReceipts();
    const log = createCommandReceiptLog(async () => database.commandReceipts);
    await log.write("k", { ok: true, result: "first" });
    await log.write("k", { ok: true, result: "second" });

    await expect(log.read("k")).resolves.toEqual({
      ok: true,
      result: "first",
    });
    database.close();
  });
});
