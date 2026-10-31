import { requestDaemon } from "@cocurdex/daemon/client";
import {
  CHAT_WORKSPACE_ID,
  createProviderSnapshotForModel,
  type ProviderConfigRecord,
  type ProviderModelRecord,
} from "@cocurdex/shared";
import type { DaemonProcess } from "./daemon-process";
import type { StubLlmServer } from "./llm-stub";

export async function saveStubProvider(
  daemon: DaemonProcess,
  stub: StubLlmServer,
) {
  const now = new Date().toISOString();
  const provider: ProviderConfigRecord = {
    id: "e2e-stub",
    name: "E2E Stub",
    baseUrl: stub.baseUrl,
    enabled: true,
    apiKeySecretId: null,
    headersJson: JSON.stringify({ Authorization: "Bearer e2e-key" }),
    createdAt: now,
    updatedAt: now,
  };
  const model: ProviderModelRecord = {
    providerId: "e2e-stub",
    modelId: "e2e-model",
    name: "E2E Model",
    api: "openai-completions",
    enabled: true,
    source: "manual",
    capabilities: ["chat"],
    createdAt: now,
    updatedAt: now,
  };
  await requestDaemon(
    "provider.config.save",
    { config: provider },
    daemon.options,
  );
  await requestDaemon("provider.model.save", { model }, daemon.options);
  return createProviderSnapshotForModel({ provider, model });
}

export async function startChatSession(
  daemon: DaemonProcess,
  stub: StubLlmServer,
) {
  const providerSnapshot = await saveStubProvider(daemon, stub);
  return requestDaemon(
    "session.configure",
    {
      id: crypto.randomUUID(),
      workspaceId: CHAT_WORKSPACE_ID,
      sessionKind: "chat",
      title: "Chat",
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
      providerSnapshot,
    },
    daemon.options,
  );
}
