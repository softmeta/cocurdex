import path from "node:path";
import {
  type DurableStoreSource,
  useDurableStore,
} from "@cocurdex/agent-adapters";
import { createCocurdexDatabase, type DurableStore } from "@cocurdex/db";
import {
  CHAT_WORKSPACE_ID,
  createProviderSnapshotForModel,
  type SessionRecord,
} from "@cocurdex/shared";

const databases: { close(): void }[] = [];

export function closeDatabases() {
  for (const database of databases.splice(0)) database.close();
}

export function stubSnapshot(baseUrl: string) {
  return createProviderSnapshotForModel({
    provider: {
      id: "e2e-stub",
      name: "E2E Stub",
      baseUrl: baseUrl,
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
}

export function useCocurdexDatabase(
  userDataPath: string,
  source: (store: DurableStore) => DurableStoreSource = (store) => store,
) {
  const databasePath = path.join(userDataPath, "cocurdex.sqlite");
  const database = createCocurdexDatabase(databasePath);
  databases.push(database);
  useDurableStore(userDataPath, source(database.durableStore));
  return { database, databasePath };
}

export function chatSession(
  providerSnapshot: SessionRecord["providerSnapshot"],
) {
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

export function assistantSession(
  providerSnapshot: SessionRecord["providerSnapshot"],
) {
  return {
    ...chatSession(providerSnapshot),
    id: "assistant-session",
    workspaceId: "personal",
    sessionKind: "personal",
    title: "Assistant",
    writeMode: "native-write",
  } as SessionRecord;
}
