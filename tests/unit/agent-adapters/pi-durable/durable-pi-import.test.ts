import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  closeDurableHosts,
  DURABLE_TABLE_PREFIX,
  LEGACY_DURABLE_DATABASE_FILENAME,
} from "@cocurdex/agent-adapters";
import { readDurableConversation } from "@cocurdex/agent-adapters/internal/pi-durable/durable-conversations";
import { createDurablePiSession } from "@cocurdex/agent-adapters/internal/pi-durable/durable-session";
import type { AgentProviderSessionRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { SessionManager } from "@earendil-works/pi-coding-agent";
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

function assistant(text: string) {
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text }],
    api: "openai-completions" as const,
    provider: "e2e-stub",
    model: "e2e-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop" as const,
    timestamp: Date.now(),
  };
}

describe("chat sessions that ran on the pi coding agent", () => {
  it("carry their pi context into the durable conversation on first open", async () => {
    const stub = await startStubLlmServer();
    try {
      const userDataPath = await tempDirs.create("cocurdex-durable-import-");
      useCocurdexDatabase(userDataPath);
      const workspaceRootPath = path.join(userDataPath, "chat");
      const manager = SessionManager.create(
        workspaceRootPath,
        path.join(userDataPath, "pi-agent", "sessions"),
      );
      manager.appendMessage({
        role: "user",
        content: "My cat is called Miso",
        timestamp: 0,
      });
      manager.appendMessage(assistant("Noted, Miso it is."));
      const sessionFile = manager.getSessionFile() ?? "";

      const snapshot = stubSnapshot(stub.baseUrl);
      const providerConfig = { ...snapshot, apiKey: "stub-key" };
      const updates: (AgentProviderSessionRecord | null)[] = [];
      stub.plan = { kind: "stream", chunks: ["Miso", " again"] };

      const session = createDurablePiSession(
        {
          session: chatSession(snapshot),
          workspaceRootPath,
          userDataPath,
          providerConfig,
          providerSession: {
            sessionId: "chat-session",
            providerSessionId: manager.getSessionId(),
            providerStateJson: JSON.stringify({ adapter: "pi", sessionFile }),
            providerVersion: "pi-sdk",
            resumable: true,
            updatedAt: "2026-11-14T00:00:00.000Z",
          },
          onProviderSessionUpdate: (record) => updates.push(record),
        },
        () => {},
      );
      const response = await session.sendMessage({
        messageId: crypto.randomUUID(),
        content: "What is my cat called?",
        history: [],
        providerConfig,
      });
      await session.dispose();

      expect(response.content).toBe("Miso again");
      const sent = JSON.stringify(stub.requests.at(-1)?.body.messages);
      expect(sent).toContain("My cat is called Miso");
      expect(sent).toContain("Noted, Miso it is.");
      expect(sent).toContain("What is my cat called?");
      const stored = updates.at(-1)?.providerStateJson ?? "";
      expect(readDurableConversation(stored)).not.toBeNull();
    } finally {
      await stub.close();
    }
  });
});

describe("durable conversations kept in pi-durable.sqlite", () => {
  it("move into cocurdex.sqlite and keep their context", async () => {
    const stub = await startStubLlmServer();
    try {
      const before = await tempDirs.create("cocurdex-durable-legacy-a-");
      const after = await tempDirs.create("cocurdex-durable-legacy-b-");
      const workspaceRootPath = path.join(before, "chat");
      const snapshot = stubSnapshot(stub.baseUrl);
      const providerConfig = { ...snapshot, apiKey: "stub-key" };
      const turn = async (
        userDataPath: string,
        content: string,
        providerSession: AgentProviderSessionRecord | null,
      ) => {
        const updates: (AgentProviderSessionRecord | null)[] = [];
        const session = createDurablePiSession(
          {
            session: chatSession(snapshot),
            workspaceRootPath,
            userDataPath,
            providerConfig,
            providerSession,
            onProviderSessionUpdate: (record) => updates.push(record),
          },
          () => {},
        );
        await session.sendMessage({
          messageId: crypto.randomUUID(),
          content,
          history: [],
          providerConfig,
        });
        await session.dispose();
        await closeDurableHosts();
        return updates.at(-1) ?? providerSession;
      };

      const first = useCocurdexDatabase(before);
      stub.plan = { kind: "stream", chunks: ["Noted"] };
      const providerSession = await turn(before, "My cat is called Miso", null);
      first.database.close();
      const legacy = new DatabaseSync(
        path.join(after, LEGACY_DURABLE_DATABASE_FILENAME),
      );
      legacy.prepare("ATTACH DATABASE ? AS source").run(first.databasePath);
      const objects = legacy
        .prepare(
          "SELECT type, name, sql FROM source.sqlite_master WHERE name LIKE ? AND sql IS NOT NULL",
        )
        .all(`${DURABLE_TABLE_PREFIX}%`)
        .map((row) => ({
          type: String(row.type),
          name: String(row.name),
          sql: String(row.sql),
        }));
      for (const object of objects) {
        legacy.exec(object.sql.replaceAll(DURABLE_TABLE_PREFIX, ""));
      }
      for (const { name } of objects.filter((o) => o.type === "table")) {
        legacy.exec(
          `INSERT INTO ${name.slice(DURABLE_TABLE_PREFIX.length)} SELECT * FROM source.${name}`,
        );
      }
      legacy.close();

      useCocurdexDatabase(after);
      stub.plan = { kind: "stream", chunks: ["Miso"] };
      await turn(after, "What is my cat called?", providerSession);

      const sent = JSON.stringify(stub.requests.at(-1)?.body.messages);
      expect(sent).toContain("My cat is called Miso");
      expect(
        existsSync(path.join(after, LEGACY_DURABLE_DATABASE_FILENAME)),
      ).toBe(false);
      expect(
        readdirSync(after).some((name) =>
          name.startsWith(`${LEGACY_DURABLE_DATABASE_FILENAME}.migrated-`),
        ),
      ).toBe(true);
    } finally {
      await stub.close();
    }
  });
});
