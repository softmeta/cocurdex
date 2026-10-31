import type { TaskApi } from "@cocurdex/shared";
import { commandDaemon, requestDaemon as rpc } from "./daemon-client";
import { onDaemonAgentEvent } from "./daemon-events";

export const taskApi: TaskApi = {
  listSessions: () => rpc("session.list"),
  getSessionSnapshot: (sessionId) => rpc("session.snapshot", { sessionId }),
  saveSessionConfiguration: (input) => rpc("session.configure", input),
  sendMessage: (input) =>
    commandDaemon("session.send", input, { idempotencyKey: input.messageId }),
  stopSession: async (sessionId) => {
    await rpc("session.stop", { sessionId });
  },
  resolvePermission: (requestId, optionId) =>
    rpc("permission.resolve", { requestId, optionId }),
  resolveQuestion: (questionId, answer) =>
    rpc("question.resolve", { questionId, answer }),
  resolvePlanApproval: (approvalId, decision) =>
    rpc("planApproval.resolve", {
      approvalId,
      decision: {
        outcome: decision.outcome,
        feedback: decision.feedback ?? null,
      },
    }),
  onAgentEvent: onDaemonAgentEvent,
};
