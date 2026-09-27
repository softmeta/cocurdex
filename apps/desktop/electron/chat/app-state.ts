import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  AgentDescriptor,
  AgentId,
  AgentRoleRecord,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  EditorViewRecord,
  SaveAgentRolePayload,
  SessionMessagesResult,
  SessionRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";

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

export async function chatDaemonOptions() {
  await daemonReady;
  return daemonOptions();
}

export function initializeAppState(userDataPath: string) {
  daemonUserDataPath = userDataPath;
}

export function setDaemonReady(ready: Promise<unknown>) {
  daemonReady = ready.catch(() => undefined);
}

export async function bootstrapAppState(): Promise<AppBootstrapData> {
  await daemonReady;
  return requestDaemon("app.bootstrap", daemonOptions());
}

export async function listAgents(): Promise<AgentDescriptor[]> {
  await daemonReady;
  return requestDaemon("agent.list", daemonOptions());
}

export async function readAgentSessionModes(agentId: AgentId) {
  await daemonReady;
  return requestDaemon("agent.sessionModes.read", { agentId }, daemonOptions());
}

export async function readAdapterRateLimits(agentIds: AgentId[]) {
  await daemonReady;
  return requestDaemon("agent.rateLimits.read", { agentIds }, daemonOptions());
}

export async function saveWorkspace(
  workspace: WorkspaceRecord,
): Promise<WorkspaceRecord> {
  await daemonReady;
  return requestDaemon("workspace.save", { workspace }, daemonOptions());
}

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  await daemonReady;
  return requestDaemon("workspace.list", daemonOptions());
}

export async function deleteWorkspace(workspaceId: string) {
  await requestDaemon(
    "workspace.delete",
    { workspaceId },
    await chatDaemonOptions(),
  );
}

export async function archiveSession(
  sessionId: string,
): Promise<SessionRecord | null> {
  return requestDaemon(
    "session.archive",
    { sessionId },
    await chatDaemonOptions(),
  );
}

export async function listArchivedSessions(): Promise<SessionRecord[]> {
  return requestDaemon("session.listArchived", await chatDaemonOptions());
}

export async function restoreSession(
  sessionId: string,
): Promise<SessionRecord[]> {
  return requestDaemon(
    "session.restore",
    { sessionId },
    await chatDaemonOptions(),
  );
}

export async function deleteSession(sessionId: string) {
  await daemonReady;
  await requestDaemon("session.delete", { sessionId }, daemonOptions());
}

export async function getSession(
  sessionId: string,
): Promise<SessionRecord | null> {
  return requestDaemon("session.get", { sessionId }, await chatDaemonOptions());
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

export async function listMessagesBySessionId(
  sessionId: string,
): Promise<SessionMessagesResult> {
  return requestDaemon(
    "session.listMessages",
    { sessionId },
    await chatDaemonOptions(),
  );
}

export async function listToolCallsBySessionId(
  sessionId: string,
): Promise<AgentToolCallRecord[]> {
  return requestDaemon(
    "session.listToolCalls",
    { sessionId },
    await chatDaemonOptions(),
  );
}

export async function getToolCallResult(
  toolCallId: string,
): Promise<AgentToolCallResult | null> {
  return requestDaemon(
    "session.getToolCallResult",
    { toolCallId },
    await chatDaemonOptions(),
  );
}

export async function saveEditorView(view: EditorViewRecord) {
  await requestDaemon("editorView.save", { view }, await chatDaemonOptions());
}

export async function listAgentRoles(): Promise<AgentRoleRecord[]> {
  await daemonReady;
  return requestDaemon("agentRole.list", daemonOptions());
}

export async function saveAgentRole(
  payload: SaveAgentRolePayload,
): Promise<AgentRoleRecord> {
  await daemonReady;
  return requestDaemon("agentRole.save", payload, daemonOptions());
}

export async function deleteAgentRole(id: string): Promise<void> {
  await daemonReady;
  await requestDaemon("agentRole.delete", { id }, daemonOptions());
}
