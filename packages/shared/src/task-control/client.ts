import type { SessionRecord } from "../contracts";
import type { SessionConfiguration, TaskApi } from "./types";

export function sessionConfiguration(
  session: SessionRecord,
): SessionConfiguration {
  const {
    id,
    workspaceId,
    title,
    agentType,
    writeMode,
    collaborationMode,
    permissionMode,
    agentRoleId,
    providerSnapshot,
    worktreePath,
  } = session;
  return {
    id,
    workspaceId,
    title,
    agentType,
    writeMode,
    collaborationMode,
    permissionMode,
    agentRoleId,
    providerSnapshot,
    worktreePath,
  };
}

export function createTaskClient(resolveApi: () => TaskApi): TaskApi {
  return {
    async submitPreviousMessage(input) {
      return resolveApi().submitPreviousMessage(input);
    },
    async getPreviousMessageCheckpointStatus(sessionId, messageId) {
      return resolveApi().getPreviousMessageCheckpointStatus(
        sessionId,
        messageId,
      );
    },
    async listSessions() {
      return resolveApi().listSessions();
    },
    async getSessionSnapshot(id) {
      return resolveApi().getSessionSnapshot(id);
    },
    async saveSessionConfiguration(input) {
      return resolveApi().saveSessionConfiguration(input);
    },
    async sendMessage(input) {
      return resolveApi().sendMessage(input);
    },
    async stopSession(id) {
      await resolveApi().stopSession(id);
    },
    async resolvePermission(id, decision) {
      return resolveApi().resolvePermission(id, decision);
    },
    async resolveQuestion(id, answer) {
      return resolveApi().resolveQuestion(id, answer);
    },
    async resolvePlanApproval(id, decision) {
      return resolveApi().resolvePlanApproval(id, decision);
    },
    onAgentEvent(listener) {
      return resolveApi().onAgentEvent(listener);
    },
  };
}
