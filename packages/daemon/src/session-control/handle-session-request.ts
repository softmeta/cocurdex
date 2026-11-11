import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import { validateSessionId } from "@cocurdex/shared";
import type { DaemonRequestContext } from "../host-access/request-context";
import type { CocurdexDaemonService } from "../service";

const SESSION_PREFIXES = [
  "session.",
  "assistant.session.",
  "attention.",
  "permission.",
  "question.",
  "planApproval.",
] as const;

type SessionMethod = Extract<
  DaemonMethod,
  `${(typeof SESSION_PREFIXES)[number]}${string}`
>;

export function isSessionRequest(
  request: DaemonRequest,
): request is DaemonRequest<SessionMethod> {
  return SESSION_PREFIXES.some((prefix) => request.method.startsWith(prefix));
}

export async function handleSessionRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest<SessionMethod>,
  context: DaemonRequestContext,
): Promise<DaemonResultByMethod[SessionMethod]> {
  switch (request.method) {
    case "session.list":
      return service.listSessions();
    case "session.snapshot":
      return service.getSessionSnapshot(request.params.sessionId);
    case "session.transcriptPage":
      return service.getSessionTranscriptPage(
        request.params.sessionId,
        request.params.beforeSeq,
      );
    case "session.executionTree":
      return service.getSessionExecutionTree(
        request.params.sessionId,
        request.params.maxDepth,
      );
    case "session.fork":
      return service.forkSession(request.params);
    case "session.switchAgent":
      return service.switchSessionAgent(
        request.params.sessionId,
        request.params.agentType,
      );
    case "session.contextTransfers":
      return service.listContextTransfers(request.params.sessionId);
    case "session.resolveNew":
      return service.resolveNewSessionDefaults(request.params);
    case "session.create":
      return service.createSession(request.params);
    case "session.configure":
      return service.saveSessionConfiguration(
        request.params,
        context.principal,
      );
    case "session.get":
      return service.getSession(request.params.sessionId);
    case "session.lastMessage":
      return service.getLatestSessionReply(request.params.sessionId);
    case "session.runtimeState":
      return service.getSessionRuntimeState(request.params.sessionId);
    case "session.listPeers":
      return service.peerMessaging.listPeers(request.params.sessionId);
    case "session.sendPeerMessage":
      return service.peerMessaging.send(request.params);
    case "session.setPeerInbound":
      return service.setSessionPeerInbound(
        request.params.sessionId,
        request.params.policy,
      );
    case "session.archive":
      return service.archiveSession(request.params.sessionId);
    case "session.restore":
      return service.restoreSession(request.params.sessionId);
    case "session.archiveMany":
      return service.archiveSessions(request.params.sessionIds);
    case "session.restoreMany":
      return service.restoreSessions(request.params.sessionIds);
    case "session.listArchived":
      return service.state.listArchivedSessions();
    case "session.delete":
      await service.deleteSession(request.params.sessionId);
      return null;
    case "session.updateTitle":
      return service.updateSessionTitle(request.params);
    case "session.setPinned":
      return service.setSessionPinned(request.params);
    case "session.refineTitle":
      return service.refineSessionTitle(request.params);
    case "session.listMessages":
      validateSessionId(request.params.sessionId);
      return service.state.listSessionMessages(request.params.sessionId);
    case "session.listToolCalls":
      validateSessionId(request.params.sessionId);
      return service.state.listToolCallSummaries(request.params.sessionId);
    case "session.listSlashCommands":
      return service.listSessionSlashCommands(
        request.params.agentType,
        request.params.workspaceRootPath,
      );
    case "session.send":
      await service.workspaces.assertClientAttachmentsAccess(
        context.principal,
        request.params.attachments,
      );
      return service.sendSessionMessage(request.params);
    case "session.resumeQueued":
      return service.resumeQueuedSession(request.params.sessionId);
    case "session.updateQueued":
      return service.updateQueuedAgentInput(
        request.params.sessionId,
        request.params.messageId,
        request.params.content,
      );
    case "session.deleteQueued":
      await service.deleteQueuedAgentInput(
        request.params.sessionId,
        request.params.messageId,
      );
      return null;
    case "session.steerQueued":
      return service.steerQueuedAgentInput(
        request.params.sessionId,
        request.params.messageId,
      );
    case "session.sendQueuedNow":
      return service.sendQueuedAgentInputNow(
        request.params.sessionId,
        request.params.messageId,
      );
    case "session.setConfig":
      return service.setSessionRuntimeConfigOption(
        request.params.sessionId,
        request.params.configId,
        request.params.value,
      );
    case "session.setMode":
      await service.setSessionRuntimeMode(
        request.params.sessionId,
        request.params.modeId,
      );
      return null;
    case "session.updateRuntime":
      return service.updateSessionRuntime(request.params, context.principal);
    case "session.stop":
      return service.stopSession(request.params.sessionId);
    case "session.undoTurnChanges":
      return service.undoTurnChanges(request.params);
    case "session.getTurnChangeFile":
      return service.getTurnChangeFile(request.params);
    case "session.listTurnChangeSets":
      return service.listTurnChangeSets(request.params.sessionId);
    case "session.getTurnChangeDiff":
      return service.getTurnChangeDiff(request.params);
    case "session.getToolCallResult":
      return service.getToolCallResult(request.params);
    case "assistant.session.create":
      return service.createAssistantSession(request.params.workspaceId);
    case "assistant.session.getOrCreate":
      return service.getOrCreateAssistantSession(request.params);
    case "attention.list":
      return service.listSessionAttention();
    case "attention.update":
      return service.updateSessionAttention(request.params);
    case "permission.resolve":
      return service.resolvePermission(
        request.params.requestId,
        request.params.optionId,
      );
    case "question.resolve":
      return service.resolveQuestion(
        request.params.questionId,
        request.params.answer,
      );
    case "planApproval.resolve":
      return service.resolvePlanApproval(
        request.params.approvalId,
        request.params.decision,
      );
  }
}
