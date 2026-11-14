import path from "node:path";
import { closeDurableHosts } from "@cocurdex/agent-adapters";
import { readDurableConversation } from "@cocurdex/agent-adapters/internal/pi-durable/durable-conversations";
import { createDurablePiSession } from "@cocurdex/agent-adapters/internal/pi-durable/durable-session";
import {
  type AgentProviderSessionRecord,
  CHAT_WORKSPACE_ID,
  createProviderSnapshotForModel,
  type SessionRecord,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { startStubLlmServer } from "@cocurdex/test-harness/helpers/llm-stub";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
afterAll(async () => {
  await closeDurableHosts();
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

function chatSession(providerSnapshot: SessionRecord["providerSnapshot"]) {
  const now = new Date().toISOString();
  return {
    id: "chat-session",
    workspaceId: CHAT_WORKSPACE_ID,
    sessionKind: "chat",
    title: "Chat",
    agentType: "pi",
    status: "idle",
    writeMode: "read-only",
    sessionModeId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    archivedAt: null,
    providerSnapshot,
  } as SessionRecord;
}

describe("chat sessions that ran on the pi coding agent", () => {
  it("carry their pi context into the durable conversation on first open", async () => {
    const stub = await startStubLlmServer();
    try {
      const userDataPath = await tempDirs.create("cocurdex-durable-import-");
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

      const snapshot = createProviderSnapshotForModel({
        provider: {
          id: "e2e-stub",
          name: "E2E Stub",
          baseUrl: stub.baseUrl,
          enabled: true,
          apiKeySecretId: null,
          headersJson: null,
          createdAt: "2026-11-14T00:00:00.000Z",
          updatedAt: "2026-11-14T00:00:00.000Z",
        },
        model: {
          providerId: "e2e-stub",
          modelId: "e2e-model",
          name: "E2E Model",
          api: "openai-completions",
          enabled: true,
          source: "manual",
          capabilities: ["chat"],
          createdAt: "2026-11-14T00:00:00.000Z",
          updatedAt: "2026-11-14T00:00:00.000Z",
        },
      });
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
