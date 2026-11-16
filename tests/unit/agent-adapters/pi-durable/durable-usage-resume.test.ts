import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDurableHosts } from "@cocurdex/agent-adapters";
import { createDurablePiSession } from "@cocurdex/agent-adapters/internal/pi-durable/durable-session";
import type { AgentEvent, AgentProviderSessionRecord } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { afterAll, describe, expect, it } from "vitest";
import {
  assistantSession,
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

describe("a durable run resumed after a restart", () => {
  it("counts the usage of model calls made before the restart once", async () => {
    const stub = await startStubLlmServer();
    try {
      const userDataPath = await tempDirs.create("cocurdex-durable-usage-");
      useCocurdexDatabase(userDataPath);
      const workspaceRootPath = path.join(userDataPath, "personal");
      mkdirSync(workspaceRootPath, { recursive: true });
      writeFileSync(path.join(workspaceRootPath, "notes.txt"), "Miso\n");
      const snapshot = stubSnapshot(stub.baseUrl);
      const providerConfig = { ...snapshot, apiKey: "stub-key" };
      const usage: AgentEvent[] = [];
      let providerSession: AgentProviderSessionRecord | null = null;
      const open = () =>
        createDurablePiSession(
          {
            session: assistantSession(snapshot),
            workspaceRootPath,
            userDataPath,
            providerConfig,
            providerSession,
            onProviderSessionUpdate: (record) => {
              providerSession = record;
            },
          },
          (event) => {
            if (event.type === "usage.updated") usage.push(event);
          },
        );
      const messageId = crypto.randomUUID();
      const send = (session: ReturnType<typeof open>) =>
        session.sendMessage({
          messageId,
          content: "What does notes.txt say?",
          history: [],
          providerConfig,
        });

      stub.plan = {
        kind: "script",
        turns: [
          { toolCalls: [{ name: "read", arguments: { path: "notes.txt" } }] },
        ],
      };
      const before = open();
      const interrupted = send(before).catch(() => undefined);
      await stub.nextRequest();
      stub.plan = { kind: "hang" };
      await stub.nextRequest();
      await closeDurableHosts();
      await interrupted;
      await before.dispose();
      expect(usage).toHaveLength(1);

      stub.plan = { kind: "stream", chunks: ["It says Miso"] };
      const after = open();
      const response = await send(after);
      await after.dispose();

      expect(response.content).toBe("It says Miso");
      expect(usage).toHaveLength(2);
    } finally {
      await stub.close();
    }
  });
});
