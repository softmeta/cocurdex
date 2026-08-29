import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  AgentDescriptor,
  AgentId,
  AgentProviderSelection,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  CommitMessageModelSelection,
  ConversationMessageRecord,
  ConversationRecord,
  EditorViewRecord,
  MessageRecord,
  NetworkProxyTestResult,
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionMessagesResult,
  SessionRecord,
  TitleModelSelection,
  WorkspaceRecord,
} from "@cocurdex/shared";

interface ProviderSecretRecord {
  id: string;
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
}

let daemonUserDataPath: string | null = null;
// Resolves once the runtime client has the daemon up. The window is created
// without waiting for that (so the renderer boots in parallel), which means
// every call here has to gate on it or it would connect to a socket that does
// not exist yet. A failed start still resolves: the call then fails with the
// real connection error instead of hanging forever.
let daemonReady: Promise<unknown> = Promise.resolve();

function daemonOptions() {
  if (!daemonUserDataPath) {
    throw new Error("App state daemon client not initialized");
  }
  return { userDataPath: daemonUserDataPath };
}

async function callStorage<T>(
  operation: string,
  ...args: unknown[]
): Promise<T> {
  await daemonReady;
  return requestDaemon(
    "storage.call",
    { operation, args },
    daemonOptions(),
  ) as Promise<T>;
}

export function initializeAppState(userDataPath: string) {
  daemonUserDataPath = userDataPath;
}

export function setDaemonReady(ready: Promise<unknown>) {
  daemonReady = ready.catch(() => undefined);
}

export async function testNetworkProxy(): Promise<NetworkProxyTestResult> {
  await daemonReady;
  return requestDaemon("network.proxy.test", daemonOptions());
}

export async function bootstrapAppState(): Promise<AppBootstrapData> {
  await daemonReady;
  return requestDaemon("app.bootstrap", daemonOptions());
}

export async function listAgents(): Promise<AgentDescriptor[]> {
  await daemonReady;
  return requestDaemon("agent.list", daemonOptions());
}

export async function saveWorkspace(workspace: WorkspaceRecord) {
  await daemonReady;
  await requestDaemon("workspace.save", { workspace }, daemonOptions());
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  await daemonReady;
  return requestDaemon("workspace.list", daemonOptions());
}

export function deleteWorkspace(workspaceId: string): Promise<void> {
  return callStorage("workspace.delete", workspaceId);
}

export function saveSession(session: SessionRecord): Promise<void> {
  return callStorage("session.save", session);
}

export function archiveSession(
  sessionId: string,
  archivedAt?: string,
): Promise<SessionRecord | null> {
  return callStorage("session.archive", sessionId, archivedAt);
}

export async function deleteSession(sessionId: string) {
  await daemonReady;
  await requestDaemon("session.delete", { sessionId }, daemonOptions());
}

export function getSession(sessionId: string): Promise<SessionRecord | null> {
  return callStorage("session.get", sessionId);
}

export async function updateSessionTitle(
  sessionId: string,
  title: string,
  options: { expectedTitle?: string | null; updatedAt?: string } = {},
): Promise<SessionRecord | null> {
  await daemonReady;
  return requestDaemon(
    "session.updateTitle",
    { sessionId, title, ...options },
    daemonOptions(),
  );
}

export async function generateSessionTitle(
  sessionId: string,
  message: string,
): Promise<string | null> {
  await daemonReady;
  return requestDaemon(
    "session.generateTitle",
    { sessionId, message },
    daemonOptions(),
  );
}

export function listMessagesBySessionId(
  sessionId: string,
): Promise<SessionMessagesResult> {
  return callStorage("message.listBySession", sessionId);
}

export function listToolCallsBySessionId(
  sessionId: string,
): Promise<AgentToolCallRecord[]> {
  return callStorage("toolCall.listBySession", sessionId);
}

export function getToolCallResult(
  toolCallId: string,
): Promise<AgentToolCallResult | null> {
  return callStorage("toolCall.getResult", toolCallId);
}

export function getMessageById(
  messageId: string,
): Promise<MessageRecord | null> {
  return callStorage("message.get", messageId);
}

export function saveEditorView(view: EditorViewRecord): Promise<void> {
  return callStorage("editorView.save", view);
}

export function listProviderConfigs(): Promise<ProviderConfigRecord[]> {
  return callStorage("providerConfig.list");
}

export function getProviderConfig(
  providerId: string,
): Promise<ProviderConfigRecord | null> {
  return callStorage("providerConfig.get", providerId);
}

export function saveProviderConfig(
  config: ProviderConfigRecord,
): Promise<void> {
  return callStorage("providerConfig.save", config);
}

export function deleteProviderConfig(providerId: string): Promise<void> {
  return callStorage("providerConfig.delete", providerId);
}

export function setProviderApiKeySecretId(
  providerId: string,
  secretId: string | null,
): Promise<void> {
  return callStorage("providerConfig.setSecret", providerId, secretId);
}

export function listProviderModels(
  providerId?: string,
): Promise<ProviderModelRecord[]> {
  return callStorage("providerModel.list", providerId);
}

export function getProviderModel(
  providerId: string,
  modelId: string,
): Promise<ProviderModelRecord | null> {
  return callStorage("providerModel.get", providerId, modelId);
}

export function saveProviderModel(model: ProviderModelRecord): Promise<void> {
  return callStorage("providerModel.save", model);
}

export function deleteProviderModel(
  providerId: string,
  modelId: string,
): Promise<void> {
  return callStorage("providerModel.delete", providerId, modelId);
}

export function deleteProviderModelsByProvider(
  providerId: string,
): Promise<void> {
  return callStorage("providerModel.deleteByProvider", providerId);
}

export function getProviderSecret(
  secretId: string,
): Promise<ProviderSecretRecord | null> {
  return callStorage("providerSecret.get", secretId);
}

export function saveProviderSecret(
  id: string,
  encryptedValue: string,
): Promise<void> {
  const now = new Date().toISOString();
  return callStorage("providerSecret.save", {
    id,
    encryptedValue,
    createdAt: now,
    updatedAt: now,
  });
}

export function deleteProviderSecret(secretId: string): Promise<void> {
  return callStorage("providerSecret.delete", secretId);
}

export function listConversations(): Promise<ConversationRecord[]> {
  return callStorage("conversation.list");
}

export function getConversation(
  conversationId: string,
): Promise<ConversationRecord | null> {
  return callStorage("conversation.get", conversationId);
}

export function saveConversation(
  conversation: ConversationRecord,
): Promise<void> {
  return callStorage("conversation.save", conversation);
}

export function updateConversationTitle(
  conversationId: string,
  title: string,
): Promise<ConversationRecord | null> {
  return callStorage("conversation.updateTitle", conversationId, title);
}

export function archiveConversation(
  conversationId: string,
): Promise<ConversationRecord | null> {
  return callStorage("conversation.archive", conversationId);
}

export function deleteConversation(conversationId: string): Promise<void> {
  return callStorage("conversation.delete", conversationId);
}

export function listConversationMessages(
  conversationId: string,
): Promise<ConversationMessageRecord[]> {
  return callStorage("conversationMessage.list", conversationId);
}

export function getConversationMessage(
  messageId: string,
): Promise<ConversationMessageRecord | null> {
  return callStorage("conversationMessage.get", messageId);
}

export async function saveConversationMessage(
  message: ConversationMessageRecord,
) {
  await callStorage("conversationMessage.save", message);
  await callStorage(
    "conversation.updateLastMessageAt",
    message.conversationId,
    message.updatedAt,
  );
}

export function patchConversationMessage(
  messageId: string,
  patch: Partial<
    Pick<
      ConversationMessageRecord,
      "content" | "status" | "usage" | "sources" | "error" | "updatedAt"
    >
  >,
): Promise<ConversationMessageRecord | null> {
  return callStorage("conversationMessage.patch", messageId, patch);
}

export async function truncateConversationMessages(
  conversationId: string,
  fromMessageId: string,
  options: { inclusive: boolean },
): Promise<ConversationMessageRecord[]> {
  const messages = await listConversationMessages(conversationId);
  const index = messages.findIndex((message) => message.id === fromMessageId);
  if (index === -1) {
    throw new Error(
      `Message ${fromMessageId} not found in conversation ${conversationId}`,
    );
  }
  const keepCount = options.inclusive ? index : index + 1;
  const remaining = messages.slice(0, keepCount);
  for (const message of messages.slice(keepCount)) {
    await callStorage("conversationMessage.delete", message.id);
  }
  await callStorage(
    "conversation.updateLastMessageAt",
    conversationId,
    remaining.at(-1)?.updatedAt ?? null,
  );
  return remaining;
}

const TITLE_MODEL_SETTING_KEY = "titleModel";
const COMMIT_MESSAGE_MODEL_SETTING_KEY = "commitMessageModel";

export async function getTitleModelSetting(): Promise<TitleModelSelection | null> {
  const raw = await callStorage<string | null>(
    "appSetting.get",
    TITLE_MODEL_SETTING_KEY,
  );
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<TitleModelSelection>;
    if (
      typeof parsed.providerId === "string" &&
      typeof parsed.modelId === "string"
    ) {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
  } catch {
    return null;
  }
  return null;
}

export function setTitleModelSetting(
  selection: TitleModelSelection | null,
): Promise<void> {
  return callStorage(
    "appSetting.set",
    TITLE_MODEL_SETTING_KEY,
    JSON.stringify(selection),
  );
}

export async function getCommitMessageModelSetting(): Promise<CommitMessageModelSelection | null> {
  const raw = await callStorage<string | null>(
    "appSetting.get",
    COMMIT_MESSAGE_MODEL_SETTING_KEY,
  );
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CommitMessageModelSelection>;
    if (
      typeof parsed.agentId === "string" &&
      typeof parsed.providerId === "string" &&
      typeof parsed.modelId === "string"
    ) {
      return {
        agentId: parsed.agentId as CommitMessageModelSelection["agentId"],
        providerId: parsed.providerId,
        modelId: parsed.modelId,
        reasoningEffort:
          typeof parsed.reasoningEffort === "string"
            ? parsed.reasoningEffort
            : null,
        thinkingLevel:
          typeof parsed.thinkingLevel === "string"
            ? parsed.thinkingLevel
            : null,
        serviceTier:
          typeof parsed.serviceTier === "string" ? parsed.serviceTier : null,
        fastMode: typeof parsed.fastMode === "boolean" ? parsed.fastMode : null,
        openCodeAgent:
          typeof parsed.openCodeAgent === "string"
            ? parsed.openCodeAgent
            : null,
        openCodeVariant:
          typeof parsed.openCodeVariant === "string"
            ? parsed.openCodeVariant
            : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function setCommitMessageModelSetting(
  selection: CommitMessageModelSelection | null,
): Promise<void> {
  return callStorage(
    "appSetting.set",
    COMMIT_MESSAGE_MODEL_SETTING_KEY,
    JSON.stringify(selection),
  );
}

export function getNetworkProxySetting(): Promise<string | null> {
  return callStorage<string | null>("appSetting.get", "network.proxy");
}

export function setNetworkProxySetting(valueJson: string): Promise<void> {
  return callStorage("appSetting.set", "network.proxy", valueJson);
}

export function listAgentProviderDefaults(): Promise<AgentProviderSelection[]> {
  return callStorage("agentProviderDefault.list");
}

export function getAgentProviderDefault(
  agentId: AgentId,
): Promise<AgentProviderSelection | null> {
  return callStorage("agentProviderDefault.get", agentId);
}

export function saveAgentProviderDefault(
  selection: AgentProviderSelection,
): Promise<void> {
  return callStorage("agentProviderDefault.save", selection);
}
