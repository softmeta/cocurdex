import { requestDaemon } from "@cocurdex/daemon/client";
import type { TaskApi } from "@cocurdex/shared";

export const taskApi: Omit<TaskApi, "onAgentEvent"> = {
  submitPreviousMessage: (message) =>
    requestDaemon("session.resubmit", message),
  getPreviousMessageCheckpointStatus: (sessionId, messageId) =>
    requestDaemon("session.checkpointStatus", { sessionId, messageId }),
  listSessions: () => requestDaemon("session.list"),
  getSessionSnapshot: (sessionId) =>
    requestDaemon("session.snapshot", { sessionId }),
  saveSessionConfiguration: (input) =>
    requestDaemon("session.configure", input),
  sendMessage: (message) => requestDaemon("session.send", message),
  async stopSession(sessionId) {
    await requestDaemon("session.stop", { sessionId });
  },
  resolvePermission: (requestId, decision) =>
    requestDaemon("permission.resolve", { requestId, decision }),
  resolveQuestion: (questionId, answer) =>
    requestDaemon("question.resolve", { questionId, answer }),
  resolvePlanApproval: (approvalId, decision) =>
    requestDaemon("planApproval.resolve", { approvalId, decision }),
};
