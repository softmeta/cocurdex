import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { CocurdexDaemonService } from "./service";

export function handleDaemonRequest<M extends DaemonMethod>(
  service: CocurdexDaemonService,
  request: DaemonRequest<M>,
): Promise<DaemonResultByMethod[M]>;
export async function handleDaemonRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest,
) {
  switch (request.method) {
    case "daemon.status":
      return service.status();
    case "app.bootstrap":
      return service.bootstrap();
    case "agent.list":
      return service.listAgents();
    case "daemon.subscribe":
      return null;
    case "network.proxy.test":
      return service.testNetworkProxy();
    case "attention.list":
      return service.listSessionAttention();
    case "attention.update":
      return service.updateSessionAttention(request.params);
    case "storage.call":
      return service.state.callStorage(
        request.params.operation,
        request.params.args,
      );
    case "note.list":
      return service.dataService.listNotes();
    case "note.get":
      return service.dataService.getNote(request.params);
    case "note.create":
      return service.dataService.createNote(request.params);
    case "note.update":
      return service.dataService.updateNote(request.params);
    case "note.move":
      return service.dataService.moveNote(request.params);
    case "note.delete":
      await service.dataService.deleteNote(request.params);
      return null;
    case "note.listTags":
      return service.dataService.listNoteTags(request.params.noteId);
    case "note.backlinks":
      return service.dataService.listNoteBacklinks(request.params);
    case "issue.listViews":
      return service.dataService.listIssueViews();
    case "issue.loadView":
      return service.dataService.loadIssueView(request.params);
    case "issue.createView":
      return service.dataService.createIssueView(request.params);
    case "issue.updateView":
      return service.dataService.updateIssueView(request.params);
    case "issue.deleteView":
      await service.dataService.deleteIssueView(request.params);
      return null;
    case "issue.createColumn":
      return service.dataService.createIssueColumn(request.params);
    case "issue.updateColumn":
      return service.dataService.updateIssueColumn(request.params);
    case "issue.moveColumn":
      return service.dataService.moveIssueColumn(request.params);
    case "issue.deleteColumn":
      await service.dataService.deleteIssueColumn(request.params);
      return null;
    case "issue.get":
      return service.dataService.getIssue(request.params);
    case "issue.create":
      return service.dataService.createIssue(request.params);
    case "issue.update":
      return service.dataService.updateIssue(request.params);
    case "issue.move":
      return service.dataService.moveIssue(request.params);
    case "issue.delete":
      await service.dataService.deleteIssue(request.params);
      return null;
    case "search.documents":
      return service.dataService.searchDocuments(request.params);
    case "workspace.list":
      return service.listWorkspaces();
    case "workspace.save":
      return service.saveWorkspace(request.params.workspace);
    case "session.list":
      return service.listSessions();
    case "session.snapshot":
      return service.getSessionSnapshot(request.params.sessionId);
    case "session.create":
      return service.createSession(request.params);
    case "session.delete":
      await service.deleteSession(request.params.sessionId);
      return null;
    case "session.updateTitle":
      return service.updateSessionTitle(request.params);
    case "session.generateTitle":
      return service.generateSessionTitle(
        request.params.sessionId,
        request.params.message,
      );
    case "session.listSlashCommands":
      return service.listSessionSlashCommands(
        request.params.agentType,
        request.params.workspaceRootPath,
      );
    case "session.rewind":
      await service.rewindSession(request.params.message);
      return null;
    case "session.send":
      return service.sendSessionMessage(
        request.params.message,
        request.params.providerConfig,
      );
    case "session.resumeQueued":
      return service.resumeQueuedSession(
        request.params.sessionId,
        request.params.providerConfig,
      );
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
    case "session.stop":
      return service.stopSession(request.params.sessionId);
    case "session.undoTurnChanges":
      return service.undoTurnChanges(request.params);
    case "session.getTurnChangeFile":
      return service.getTurnChangeFile(request.params);
    case "workflow.list":
      return service.listWorkflowRuns();
    case "workflow.get":
      return service.getWorkflowRun(request.params.workflowRunId);
    case "workflow.create":
      return service.createWorkflow(request.params);
    case "workflow.start":
      return service.startWorkflow(request.params.workflowRunId);
    case "workflow.decideGate":
      return service.decideWorkflowGate(request.params);
    case "workflow.cancel":
      return service.cancelWorkflow(request.params.workflowRunId);
    case "permission.resolve":
      return service.resolvePermission(
        request.params.requestId,
        request.params.decision,
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
    case "provider.listConfigs":
      return service.providerService.listProviderConfigs();
    case "provider.listModels":
      return service.providerService.listProviderModels(
        request.params.providerId,
      );
    case "provider.listCompatibleForAgent":
      return service.providerService.listCompatibleProviderModels(
        request.params.agentId,
      );
    case "provider.listDefaults":
      return service.providerService.listAgentProviderDefaults();
    default: {
      const exhaustive: never = request;
      throw new Error(
        `Unsupported daemon method: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
