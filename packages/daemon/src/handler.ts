import { logoutCodex, readCodexAccount } from "@cocurdex/agent-adapters";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { ProviderAuthMethod } from "@cocurdex/shared";
import { validateSessionId } from "@cocurdex/shared";
import {
  checkoutGitBranch,
  discardGitFiles,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  listGitBranches,
  listGitCommits,
  listGitWorktrees,
  pushGitBranch,
  stageGitFiles,
  unstageGitFiles,
} from "./git";
import type { CocurdexDaemonService } from "./service";

function isProviderAuthMethod(value: unknown): value is ProviderAuthMethod {
  return value === "oauth" || value === "api_key";
}

export function handleDaemonRequest<M extends DaemonMethod>(
  service: CocurdexDaemonService,
  request: DaemonRequest<M>,
): Promise<DaemonResultByMethod[M]>;
export async function handleDaemonRequest(
  service: CocurdexDaemonService,
  request: DaemonRequest,
) {
  await service.acpRegistry.ready;
  switch (request.method) {
    case "daemon.status":
      return service.status();
    case "daemon.shutdownIfIdle":
      throw new Error(
        "daemon.shutdownIfIdle is intercepted before request dispatch",
      );
    case "app.resync":
      return service.resync(request.params.sessionIds);
    case "app.bootstrap":
      return service.bootstrap();
    case "agent.list":
      return service.listAgents();
    case "agent.sessionModes.read":
      return service.readAgentSessionModes(request.params.agentId);
    case "agent.login":
      return service.providerService.loginAgent(request.params.agentId);
    case "acpRegistry.catalog":
      return service.acpRegistry.listCatalog(request.params);
    case "acpRegistry.install":
      return service.installAcpRegistryAgent(request.params.registryId);
    case "acpRegistry.installCommand":
      return service.installAcpRegistryCommand(request.params);
    case "acpRegistry.uninstall":
      return service.uninstallAcpRegistryAgent(request.params.agentId);
    case "agent.rateLimits.read":
      return service.readAdapterRateLimits(request.params.agentIds);
    case "daemon.subscribe":
      throw new Error(
        "daemon.subscribe is intercepted before request dispatch",
      );
    case "network.proxy.test":
      return service.testNetworkProxy(request.params.settings);
    case "network.proxy.get":
      return service.getNetworkProxySettings();
    case "network.proxy.set":
      return service.setNetworkProxySettings(request.params.settings);
    case "attention.list":
      return service.listSessionAttention();
    case "attention.update":
      return service.updateSessionAttention(request.params);
    case "attachment.importImage":
      return service.attachments.importImage(request.params);
    case "attachment.importDocument":
      return service.attachments.importDocument(request.params);
    case "attachment.readImageDataUrl":
      return service.attachments.readImageDataUrl(request.params.filePath);
    case "note.list":
      return service.dataService.listNotes();
    case "note.get":
      return service.dataService.getNote(request.params);
    case "note.getDoc":
      return service.dataService.getNoteDoc(request.params);
    case "note.applyDocUpdate":
      return service.dataService.applyNoteDocUpdate(request.params);
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
    case "issue.getDetail":
      return service.dataService.getIssueDetail(request.params);
    case "issue.listLabels":
      return service.dataService.listIssueLabels();
    case "issue.createLabel":
      return service.dataService.createIssueLabel(request.params);
    case "issue.updateLabel":
      return service.dataService.updateIssueLabel(request.params);
    case "issue.deleteLabel":
      await service.dataService.deleteIssueLabel(request.params);
      return null;
    case "issue.addRelation":
      return service.dataService.addIssueRelation(request.params);
    case "issue.removeRelation":
      return service.dataService.removeIssueRelation(request.params);
    case "issue.comment":
      return service.dataService.commentIssue(request.params);
    case "issue.linkSession":
      return service.dataService.linkIssueSession(request.params);
    case "issue.listLinkedSessionIds":
      return service.dataService.listIssueLinkedSessionIds();
    case "search.documents":
      return service.dataService.searchDocuments(request.params);
    case "workspace.list":
      return service.listWorkspaces();
    case "workspace.listEntries":
      return service.listWorkspaceEntries(request.params.rootPath);
    case "workspace.listFiles":
      return service.listWorkspaceFiles(request.params.rootPath);
    case "file.readText":
      return service.readWorkspaceTextFile(request.params.filePath);
    case "file.exists":
      return service.workspaceFileExists(request.params.filePath);
    case "fs.listDirectories":
      return service.listHostDirectories(request.params.path);
    case "search.start":
      await service.searchService.start(request.params);
      return null;
    case "search.cancel":
      service.searchService.cancel(request.params.searchId);
      return null;
    case "mcp.readConfig":
      return service.mcpConfigService.readConfig();
    case "mcp.saveConfig":
      return service.mcpConfigService.saveConfig(request.params.content);
    case "skills.getStatus":
      return service.skillsService.getStatus(request.params);
    case "skills.install":
      return service.skillsService.install(request.params);
    case "skills.remove":
      return service.skillsService.remove(request.params);
    case "pdf.loadAnnotations":
      return service.pdfAnnotationsService.loadAnnotations(
        request.params.filePath,
      );
    case "pdf.updateAnnotations":
      return service.pdfAnnotationsService.updateAnnotations(
        request.params.filePath,
        request.params.operation,
      );
    case "workspace.save":
      return service.saveWorkspace(request.params.workspace);
    case "workspace.delete":
      await service.deleteWorkspace(request.params.workspaceId);
      return null;
    case "workspace.resolveOpenPath":
      return service.resolveWorkspaceOpenPath(
        request.params.path,
        request.params.allowFile,
      );
    case "editorView.save":
      await service.state.saveEditorView(request.params.view);
      return null;
    case "workspace.worktreeEnvironment.get":
      return service.getWorktreeEnvironment(request.params.workspaceId);
    case "workspace.worktreeEnvironment.save":
      return service.saveWorktreeEnvironment(request.params);
    case "assistant.session.create":
      return service.createAssistantSession(request.params.workspaceId);
    case "assistant.session.getOrCreate":
      return service.getOrCreateAssistantSession(request.params);
    case "settings.pendingChanges.list":
      return service.listPendingSettingsChanges();
    case "settings.pendingChanges.ack":
      await service.acknowledgeSettingsChange(request.params.id);
      return null;
    case "settings.values.report":
      await service.reportSettingValues(request.params.values);
      return null;
    case "workspace.runWorktreeSetup":
      return service.runWorktreeSetup(request.params);
    case "worktree.settings.get":
      return service.getWorktreeSettings();
    case "worktree.settings.save":
      return service.saveWorktreeSettings(request.params);
    case "worktree.list":
      return service.listManagedWorktrees();
    case "worktree.create":
      return service.createWorktree(request.params);
    case "worktree.remove":
      return service.removeWorktree(request.params);
    case "session.list":
      return service.listSessions();
    case "session.snapshot":
      return service.getSessionSnapshot(request.params.sessionId);
    case "session.configure":
      return service.saveSessionConfiguration(request.params);
    case "session.get":
      return service.getSession(request.params.sessionId);
    case "session.listPeers":
      return service.peerMessaging.listPeers(request.params.sessionId);
    case "session.sendPeerMessage":
      return service.peerMessaging.send(request.params);
    case "session.setPeerInbound":
      return service.setSessionPeerInbound(
        request.params.sessionId,
        request.params.policy,
      );
    case "team.get":
      return service.team.get(request.params.leadSessionId);
    case "team.create":
      return service.team.create(request.params);
    case "team.spawn": {
      const { leadSessionId, ...payload } = request.params;
      return service.team.spawn(leadSessionId, payload);
    }
    case "team.stopMember":
      return service.team.stopMember(
        request.params.teamId,
        request.params.sessionId,
      );
    case "team.stop":
      return service.team.stop(request.params.teamId);
    case "team.spawnTemplate": {
      const { leadSessionId, ...payload } = request.params;
      return service.team.spawnTemplate(leadSessionId, payload);
    }
    case "teamTemplate.list":
      return service.team.listTemplates();
    case "teamTemplate.save":
      return service.team.saveTemplate(request.params);
    case "teamTemplate.delete":
      await service.team.deleteTemplate(request.params.id);
      return null;
    case "scriptRun.create":
      return service.scriptRuns.create(request.params);
    case "scriptRun.start":
      return service.scriptRuns.start(request.params);
    case "scriptRun.cancel":
      return service.scriptRuns.cancel(request.params.runId);
    case "scriptRun.get":
      return service.scriptRuns.get(request.params.runId);
    case "scriptRun.list":
      return service.scriptRuns.list(request.params);
    case "scriptRun.settings.get":
      return service.scriptRuns.getSettings();
    case "scriptRun.settings.save":
      return service.scriptRuns.saveSettings(request.params);
    case "provider.apiKey.set":
      await service.providerCredentials.setApiKey(
        request.params.providerId,
        request.params.apiKey,
      );
      return null;
    case "provider.listTemplates":
      return service.providerService.listTemplates();
    case "provider.config.get":
      return service.providerService.getProviderConfig(
        request.params.providerId,
      );
    case "provider.config.save":
      return service.providerService.saveProviderConfig(request.params.config);
    case "provider.config.delete":
      await service.providerService.deleteProviderConfig(
        request.params.providerId,
      );
      return null;
    case "provider.model.save":
      return service.providerService.saveProviderModel(request.params.model);
    case "provider.model.delete":
      await service.providerService.deleteProviderModel(
        request.params.providerId,
        request.params.modelId,
      );
      return null;
    case "provider.fetchModels":
      return service.providerService.fetchModels(request.params.providerId);
    case "provider.listAllModels":
      return service.providerService.listAllModels(request.params);
    case "provider.default.get":
      return service.providerService.getAgentProviderDefault(
        request.params.agentId,
      );
    case "provider.default.set":
      await service.providerService.setAgentProviderDefault(
        request.params.agentId,
        request.params.providerId,
        request.params.modelId,
      );
      return null;
    case "provider.titleModel.get":
      return service.providerService.getTitleModel();
    case "provider.titleModel.set":
      await service.providerService.setTitleModel(request.params.selection);
      return null;
    case "provider.titleModel.probe":
      return service.providerService.probeTitleModel(request.params.selection);
    case "provider.auth.read":
      return service.providerService.readAuthState(request.params.providerId);
    case "provider.auth.logout":
      await service.providerService.authLogout(request.params.providerId);
      return null;
    case "provider.auth.login.start":
      if (!isProviderAuthMethod(request.params.method)) {
        throw new Error("Invalid provider auth method");
      }
      return service.providerLogins.start(
        request.params.providerId,
        request.params.method,
      );
    case "provider.auth.login.next":
      return service.providerLogins.next(request.params.loginId);
    case "provider.auth.login.respond":
      service.providerLogins.respond(
        request.params.loginId,
        request.params.promptId,
        request.params.value,
      );
      return null;
    case "provider.importJson":
      return service.providerService.importJson(request.params.json);
    case "provider.exportJson":
      return service.providerService.exportJson();
    case "provider.auth.login.cancel":
      service.providerLogins.cancel(request.params.loginId);
      return null;
    case "codex.account.read":
      return readCodexAccount();
    case "codex.login.start":
      return service.codexLogins.start();
    case "codex.login.wait":
      return service.codexLogins.wait(request.params.loginId);
    case "codex.login.cancel":
      await service.codexLogins.cancel(request.params.loginId);
      return null;
    case "codex.logout":
      await logoutCodex();
      return null;
    case "session.archive":
      return service.archiveSession(request.params.sessionId);
    case "session.restore":
      return service.restoreSession(request.params.sessionId);
    case "session.listArchived":
      return service.state.listArchivedSessions();
    case "session.delete":
      await service.deleteSession(request.params.sessionId);
      return null;
    case "session.updateTitle":
      return service.updateSessionTitle(request.params);
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
    case "session.resubmit":
      return service.submitPreviousMessage(request.params);
    case "session.checkpointStatus":
      return service.getPreviousMessageCheckpointStatus(
        request.params.sessionId,
        request.params.messageId,
      );
    case "session.send":
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
    case "workflow.list":
      return service.listWorkflowRuns();
    case "workflow.get":
      return service.getWorkflowRun(request.params.workflowRunId);
    case "workflow.listDefinitions":
      return service.listWorkflowDefinitions();
    case "workflow.getDefinition":
      return service.getWorkflowDefinition(request.params.definitionId);
    case "workflow.saveDefinition":
      return service.saveWorkflowDefinition(request.params);
    case "workflow.duplicateDefinition":
      return service.duplicateWorkflowDefinition(request.params.definitionId);
    case "workflow.deleteDefinition":
      await service.deleteWorkflowDefinition(request.params.definitionId);
      return null;
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
    case "provider.listConfigs":
      return service.providerService.listProviderConfigs();
    case "git.commitMessageModel.get":
      return service.commitMessageService.getModelSetting();
    case "git.commitMessageModel.set":
      return service.commitMessageService.setModelSetting(
        request.params.selection,
      );
    case "git.commitMessageModel.resolve":
      return service.commitMessageService.resolveModel();
    case "git.generateCommitMessage":
      return service.commitMessageService.generate(request.params);
    case "git.listBranches":
      await service.watchWorkspace(request.params.rootPath);
      return listGitBranches(request.params.rootPath);
    case "git.checkoutBranch":
      return checkoutGitBranch(request.params.rootPath, request.params.branch);
    case "git.listWorktrees":
      await service.watchWorkspace(request.params.rootPath);
      return listGitWorktrees(request.params.rootPath);
    case "git.listCommits":
      await service.watchWorkspace(request.params.rootPath);
      return listGitCommits(request.params.rootPath, {
        limit: request.params.limit,
      });
    case "git.status":
      await service.watchWorkspace(request.params.rootPath);
      return getWorkspaceGitStatus(request.params.rootPath);
    case "git.diff":
      await service.watchWorkspace(request.params.rootPath);
      return getWorkspaceDiff(request.params.rootPath, request.params.query);
    case "git.stageFiles":
      return stageGitFiles(request.params.rootPath, request.params.filePaths);
    case "git.unstageFiles":
      return unstageGitFiles(request.params.rootPath, request.params.filePaths);
    case "git.discardFiles":
      return discardGitFiles(request.params.rootPath, request.params.filePaths);
    case "git.commit":
      return service.commitWorkspaceChanges(request.params);
    case "git.push":
      return pushGitBranch(request.params.rootPath);
    case "provider.listModels":
      return service.providerService.listProviderModels(
        request.params.providerId,
      );
    case "provider.listCompatibleForAgent":
      return service.providerService.listCompatibleProviderModels(
        request.params.agentId,
        { forceRefresh: request.params.forceRefresh },
      );
    case "provider.modelAxes.probe":
      return service.providerService.probeAgentModelAxes(
        request.params.agentId,
        request.params.modelId,
      );
    case "provider.listDefaults":
      return service.providerService.listAgentProviderDefaults();
    case "agentRole.list":
      return service.listAgentRoles();
    case "agentRole.get":
      return service.getAgentRole(request.params.id);
    case "agentRole.save":
      return service.saveAgentRole(request.params);
    case "agentRole.delete":
      await service.deleteAgentRole(request.params.id);
      return null;
    default: {
      const exhaustive: never = request;
      throw new Error(
        `Unsupported daemon method: ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}
