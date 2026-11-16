import path from "node:path";
import { closeDurableHosts } from "@cocurdex/agent-adapters";
import { getDurableHost } from "@cocurdex/agent-adapters/internal/pi-durable/durable-host";
import { createDurablePiSession } from "@cocurdex/agent-adapters/internal/pi-durable/durable-session";
import type { DurableSqliteDatabase, DurableStore } from "@cocurdex/db";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import {
  chatSession,
  closeDatabases,
  stubSnapshot,
  useCocurdexDatabase,
} from "./durable-fixtures";

const tempDirs = createTempDirs();
afterAll(async () => {
  await closeDurableHosts();
  closeDatabases();
  await tempDirs.cleanup();
});

/** The daemon's durable store, whose next transaction fails once `failNext` is set. */
function failingOnce(store: DurableStore) {
  const control = { failNext: false };
  const source = {
    hasTable: (name: string) => store.hasTable(name),
    importTables: (sourcePath: string, prefix: string) =>
      store.importTables(sourcePath, prefix),
    open(): DurableSqliteDatabase {
      const handle = store.open();
      return {
        exec: (sql) => handle.exec(sql),
        run: (sql, ...params) => handle.run(sql, ...params),
        runCounted: (sql, ...params) => handle.runCounted(sql, ...params),
        get: (sql, ...params) => handle.get(sql, ...params),
        all: (sql, ...params) => handle.all(sql, ...params),
        close: () => handle.close(),
        transaction(callback) {
          if (!control.failNext) return handle.transaction(callback);
          control.failNext = false;
          return Promise.reject(new Error("disk I/O error"));
        },
      };
    },
  };
  return { control, source };
}

describe("a durable storage error", () => {
  it("ends that turn, and the next turn reopens the same conversation", async () => {
    const stub = await startStubLlmServer();
    try {
      const userDataPath = await tempDirs.create("cocurdex-durable-recovery-");
      const failing = { control: { failNext: false } };
      useCocurdexDatabase(userDataPath, (store) => {
        const created = failingOnce(store);
        failing.control = created.control;
        return created.source;
      });
      const snapshot = stubSnapshot(stub.baseUrl);
      const providerConfig = { ...snapshot, apiKey: "stub-key" };
      const session = createDurablePiSession(
        {
          session: chatSession(snapshot),
          workspaceRootPath: path.join(userDataPath, "chat"),
          userDataPath,
          providerConfig,
          providerSession: null,
        },
        () => {},
      );
      const send = (content: string) =>
        session.sendMessage({
          messageId: crypto.randomUUID(),
          content,
          history: [],
          providerConfig,
        });

      stub.plan = { kind: "stream", chunks: ["Noted"] };
      await send("My cat is called Miso");
      const failed = await getDurableHost(userDataPath).harness();
      failing.control.failNext = true;
      await send("Still there?").catch(() => undefined);
      await expect(failed.closed).resolves.toMatchObject({ kind: "failed" });

      stub.plan = { kind: "stream", chunks: ["Miso"] };
      const response = await send("What is my cat called?");
      await session.dispose();

      expect(response.content).toBe("Miso");
      expect(JSON.stringify(stub.requests.at(-1)?.body.messages)).toContain(
        "My cat is called Miso",
      );
    } finally {
      await stub.close();
    }
  });
});
