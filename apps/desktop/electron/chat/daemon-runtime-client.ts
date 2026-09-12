import { requestDaemon } from "@cocurdex/daemon/client";
import { createDaemonEventConnection } from "./daemon-event-connection";
import { createDaemonRuntimeLifecycle } from "./daemon-runtime-lifecycle";
import type {
  DaemonRuntimeClient,
  DaemonRuntimeClientOptions,
} from "./daemon-runtime-types";

export type {
  DaemonRuntimeClient,
  DaemonRuntimeStatus,
} from "./daemon-runtime-types";

export function createDaemonRuntimeClient(
  options: DaemonRuntimeClientOptions,
): DaemonRuntimeClient {
  const lifecycle = createDaemonRuntimeLifecycle(options);
  const ensureDaemon = lifecycle.ensure;
  const requestOptions = () => ({ userDataPath: options.userDataPath });
  const connection = createDaemonEventConnection({
    ensure: ensureDaemon,
    userDataPath: options.userDataPath,
    onEvent: options.onEvent,
    onConnected: options.onConnected,
    onDisconnect(error) {
      lifecycle.invalidate();
      options.logger.warn("daemon.subscriptionDisconnected", {
        error: error.message,
      });
    },
  });
  return {
    async createSession(payload) {
      await ensureDaemon();
      return requestDaemon("session.create", payload, requestOptions());
    },
    async deleteSession(sessionId) {
      await ensureDaemon();
      await requestDaemon("session.delete", { sessionId }, requestOptions());
    },
    async dispose() {
      connection.dispose();
      await lifecycle.dispose();
    },
    getStatus: lifecycle.getStatus,
    async initialize() {
      await ensureDaemon();
      await connection.connect();
    },
    async restart() {
      connection.reset();
      try {
        await lifecycle.restart();
      } finally {
        await connection.connect();
      }
      return lifecycle.getStatus();
    },
    async listSlashCommands(agentType, workspaceRootPath) {
      await ensureDaemon();
      return requestDaemon(
        "session.listSlashCommands",
        { agentType, workspaceRootPath },
        requestOptions(),
      );
    },
    async resolvePermission(requestId, decision) {
      await ensureDaemon();
      return requestDaemon(
        "permission.resolve",
        { requestId, decision },
        requestOptions(),
      );
    },
    async resolveQuestion(questionId, answer) {
      await ensureDaemon();
      return requestDaemon(
        "question.resolve",
        { questionId, answer },
        requestOptions(),
      );
    },
    async resolvePlanApproval(approvalId, decision) {
      await ensureDaemon();
      return requestDaemon(
        "planApproval.resolve",
        { approvalId, decision },
        requestOptions(),
      );
    },
    async rewindSession(message) {
      await ensureDaemon();
      await requestDaemon("session.rewind", { message }, requestOptions());
    },
    async resumeQueuedSession(sessionId, providerConfig) {
      await ensureDaemon();
      return requestDaemon(
        "session.resumeQueued",
        { sessionId, providerConfig },
        requestOptions(),
      );
    },
    async sendMessage(payload, providerConfig) {
      await ensureDaemon();
      return requestDaemon(
        "session.send",
        { message: payload, providerConfig },
        requestOptions(),
      );
    },
    async updateQueuedInput(sessionId, messageId, content) {
      await ensureDaemon();
      return requestDaemon(
        "session.updateQueued",
        { sessionId, messageId, content },
        requestOptions(),
      );
    },
    async deleteQueuedInput(sessionId, messageId) {
      await ensureDaemon();
      await requestDaemon(
        "session.deleteQueued",
        { sessionId, messageId },
        requestOptions(),
      );
    },
    async steerQueuedInput(sessionId, messageId) {
      await ensureDaemon();
      return requestDaemon(
        "session.steerQueued",
        { sessionId, messageId },
        requestOptions(),
      );
    },
    async setConfig(sessionId, configId, value) {
      await ensureDaemon();
      return requestDaemon(
        "session.setConfig",
        { sessionId, configId, value },
        requestOptions(),
      );
    },
    async setMode(sessionId, modeId) {
      await ensureDaemon();
      await requestDaemon(
        "session.setMode",
        { sessionId, modeId },
        requestOptions(),
      );
    },
    async stop(sessionId) {
      await ensureDaemon();
      await requestDaemon("session.stop", { sessionId }, requestOptions());
    },
    async undoTurnChanges(payload) {
      await ensureDaemon();
      return requestDaemon(
        "session.undoTurnChanges",
        payload,
        requestOptions(),
      );
    },
    async getTurnChangeFile(payload) {
      await ensureDaemon();
      return requestDaemon(
        "session.getTurnChangeFile",
        payload,
        requestOptions(),
      );
    },
    async listTurnChangeSets(sessionId) {
      await ensureDaemon();
      return requestDaemon(
        "session.listTurnChangeSets",
        { sessionId },
        requestOptions(),
      );
    },
    async getTurnChangeDiff(payload) {
      await ensureDaemon();
      return requestDaemon(
        "session.getTurnChangeDiff",
        payload,
        requestOptions(),
      );
    },
  };
}
