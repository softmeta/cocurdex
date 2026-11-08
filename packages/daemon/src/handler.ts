import { logoutCodex, readCodexAccount } from "@cocurdex/agent-adapters";
import type {
  DaemonMethod,
  DaemonRequest,
  DaemonResultByMethod,
} from "@cocurdex/rpc";
import type { ProviderAuthMethod } from "@cocurdex/shared";
import { importDocImage, locateDocImage } from "./doc-images";
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
import {
  type DaemonRequestContext,
  handleHostRequest,
  isHostRequest,
  LOCAL_REQUEST_CONTEXT,
} from "./host-access";
import { parseDaemonRequest } from "./payloads";
import type { CocurdexDaemonService } from "./service";
import { handleSessionRequest, isSessionRequest } from "./session-control";
import {
  handleSkillRequest,
  isSkillRequest,
} from "./skills/handle-skill-request";

function assertLocalPrincipal(context: DaemonRequestContext, method: string) {
  if (context.principal.kind !== "local") {
    throw new Error(`${method} is only available on this computer`);
  }
}

function assertWorkspaceForRemote(
  context: DaemonRequestContext,
  method: string,
  workspaceId: string | undefined,
) {
  if (context.principal.kind !== "local" && !workspaceId) {
    throw new Error(
      `${method} from another device must run in a registered workspace`,
    );
  }
}

function isProviderAuthMethod(value: unknown): value is ProviderAuthMethod {
  return value === "oauth" || value === "api_key";
}

export function handleDaemonRequest<M extends DaemonMethod>(
  service: CocurdexDaemonService,
  request: DaemonRequest<M>,
  context?: DaemonRequestContext,
): Promise<DaemonResultByMethod[M]>;
export async function handleDaemonRequest(
  service: CocurdexDaemonService,
  rawRequest: DaemonRequest,
  context: DaemonRequestContext = LOCAL_REQUEST_CONTEXT,
) {
  const request = parseDaemonRequest(rawRequest);
  await service.hostAccessReady;
  if (isHostRequest(request)) {
    return handleHostRequest(service, request, context);
  }
  if (isSkillRequest(request)) {
    return handleSkillRequest(service, request, context);
  }
  await service.acpRegistry.ready;
  if (isSessionRequest(request)) {
    return handleSessionRequest(service, request, context);
  }
  switch (request.method) {
    case "daemon.status":
      return service.status();
    case "daemon.background.get":
      return service.background.status();
    case "daemon.background.set":
      return service.background.set(request.params.enabled, context.principal);
    case "daemon.shutdownIfIdle":
    case "daemon.health":
    case "diagnostics.export":
    case "diagnostics.logLevel.set":
      throw new Error(
        `${request.method} is intercepted before request dispatch`,
      );
    case "sync.pull":
      return service.pullSync(request.params);
    case "app.bootstrap":
      return service.bootstrap();
    case "agent.list":
      return service.listAgents();
    case "agent.sessionModes.read":
      return service.readAgentSessionModes(request.params.agentId);
    case "agent.login":
      return service.agentAuth.login(request.params);
    case "agent.login.cancel":
      return service.agentAuth.cancelLogin(request.params.agentId);
    case "agent.logout":
      return service.agentAuth.logout(request.params.agentId);
    case "agent.auth.read":
      return service.agentAuth.read(request.params.agentId);
    case "acpRegistry.catalog":
      return service.acpRegistry.listCatalog(request.params);
    case "acpRegistry.install":
      return service.installAcpRegistryAgent(request.params.registryId);
    case "acpRegistry.installCommand":
      return service.installAcpRegistryCommand(request.params);
    case "acpRegistry.uninstall":
      return service.uninstallAcpRegistryAgent(request.params.agentId);
    case "acpRegistry.updates":
      return service.acpRegistry.listUpdates(request.params);
    case "acpRegistry.update":
      return service.updateAcpRegistryAgent(request.params.agentId);
    case "agent.rateLimits.read":
      return service.readAdapterRateLimits(request.params.agentIds);
    case "daemon.subscribe":
    case "daemon.watchSessions":
      throw new Error(
        `${request.method} is intercepted before request dispatch`,
      );
    case "network.proxy.test":
      return service.testNetworkProxy(request.params.settings);
    case "network.proxy.get":
      return service.getNetworkProxySettings();
    case "network.proxy.set":
      return service.setNetworkProxySettings(request.params.settings);
    case "memory.status":
      return service.memory.getStatus(request.params.refresh);
    case "memory.settings.get":
      return service.memory.getSettings();
    case "memory.settings.set":
      return service.memory.setSettings(request.params.settings);
    case "memory.recall":
      return service.memory.recall(request.params);
    case "memory.show":
      return service.memory.show(request.params.id);
    case "memory.remember":
      return service.memory.remember(request.params);
    case "memory.session.save":
      return service.memory.saveSession(request.params);
    case "memory.install":
      return service.memory.install(request.params.force);
    case "memory.doctor":
      return service.memory.doctor(request.params);
    case "memory.policy":
      return service.memory.policy();
    case "memory.cloud.connect":
      assertLocalPrincipal(context, request.method);
      return service.memory.connectCloud(request.params);
    case "memory.cloud.disconnect":
      assertLocalPrincipal(context, request.method);
      return service.memory.disconnectCloud();
    case "memory.cloud.setSync":
      assertLocalPrincipal(context, request.method);
      return service.memory.setCloudSync(request.params.enabled);
    case "memory.cloud.keys":
      assertLocalPrincipal(context, request.method);
      return service.memory.cloudKeys();
    case "memory.list":
      return service.memory.list(request.params);
    case "memory.update":
      return service.memory.update(request.params);
    case "memory.forget":
      await service.memory.forget(request.params.id);
      return null;
    case "memory.restore":
      await service.memory.restore(request.params.id);
      return null;
    case "memory.history":
      return service.memory.history(request.params);
    case "memory.revision":
      return service.memory.revision();
    case "memory.capabilities":
      return service.memory.capabilities();
    case "memory.export":
      assertLocalPrincipal(context, request.method);
      await service.memory.exportTo(request.params.file);
      return null;
    case "memory.import":
      assertLocalPrincipal(context, request.method);
      return service.memory.importFrom(request.params.file);
    case "attention.list":
      return service.listSessionAttention();
    case "attention.update":
      return service.updateSessionAttention(request.params);
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
    case "link.list":
      return service.dataService.listEntityLinks(request.params);
    case "link.candidates":
      return service.dataService.listEntityLinkCandidates();
    case "link.add":
      return service.dataService.addEntityLink(request.params);
    case "link.remove":
      return service.dataService.removeEntityLink(request.params);
    case "deck.list":
      return service.decks.list();
    case "deck.get":
      return service.decks.get(request.params);
    case "deck.create":
      return service.decks.create(request.params);
    case "deck.update":
      return service.decks.update(request.params);
    case "deck.edit":
      return service.decks.edit(request.params);
    case "deck.delete":
      await service.decks.delete(request.params);
      return null;
    case "deck.check":
      return service.decks.check(request.params);
    case "deck.createDownload":
      return service.decks.createDownload(request.params);
    case "deck.exportFile":
      await service.assertClientPathAccess(
        context.principal,
        request.params.outputPath,
        "outputFile",
      );
      return service.decks.exportFile(request.params);
    case "deck.importImage":
      await service.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.importImage(request.params);
    case "image.import":
      await service.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return importDocImage(service.attachments, request.params);
    case "image.locate":
      return locateDocImage(service.attachments, request.params);
    case "deck.import":
      await service.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.importPptx(request.params);
    case "deck.readPptx":
      await service.assertClientPathAccess(
        context.principal,
        request.params.path,
        "file",
      );
      return service.decks.readPptx(request.params);
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
    case "issue.listColumns":
      return service.dataService.listIssueColumns(request.params);
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
    case "workspace.listDirectory":
      return service.listWorkspaceDirectory(
        request.params.rootPath,
        request.params.relativePath,
      );
    case "file.readText":
      return service.readWorkspaceTextFile(request.params.filePath);
    case "file.exists":
      return service.workspaceFileExists(request.params.filePath);
    case "fs.listDirectories":
      return service.listHostDirectories(request.params.path);
    case "system.homeDir":
      return service.homeDir();
    case "system.fontFamilies":
      return service.listFontFamilies();
    case "system.openDirectory":
      return service.openDirectoryInFileManager(request.params.path);
    case "system.revealPath":
      return service.revealPathInFileManager(request.params.path);
    case "terminal.spawn":
      return service.terminals.spawn(request.params);
    case "terminal.write":
      service.terminals.write(request.params.terminalId, request.params.data);
      return null;
    case "terminal.resize":
      service.terminals.resize(
        request.params.terminalId,
        request.params.cols,
        request.params.rows,
      );
      return null;
    case "terminal.kill":
      service.terminals.kill(request.params.terminalId);
      return null;
    case "search.start":
      await service.searchService.start(request.params);
      return null;
    case "search.cancel":
      service.searchService.cancel(request.params.searchId);
      return null;
    case "application.list":
      return service.applications.list();
    case "application.add":
      return service.applications.add(request.params);
    case "application.update":
      return service.applications.update(request.params);
    case "application.remove":
      await service.applications.remove(request.params.id);
      return null;
    case "application.check":
      return service.applications.check(request.params.id);
    case "application.logout":
      return service.applications.logout(request.params.id);
    case "application.login.start":
      return service.applications.startLogin(request.params.id);
    case "application.login.wait":
      return service.applications.waitLogin(
        request.params.id,
        request.params.loginId,
      );
    case "application.login.cancel":
      service.applications.cancelLogin(
        request.params.id,
        request.params.loginId,
      );
      return null;
    case "application.login.return":
      service.applications.submitRedirect(
        request.params.id,
        request.params.loginId,
        request.params.url,
      );
      return null;
    case "application.tools":
      return service.applications.tools(request.params.id);
    case "application.read":
      return service.applications.read(
        request.params.id,
        request.params.tool,
        request.params.args,
      );
    case "application.call":
      return service.applications.call(
        request.params.id,
        request.params.tool,
        request.params.args,
      );
    case "mcp.readConfig":
      return service.mcp.config.readConfig();
    case "mcp.saveConfig":
      return service.mcp.config.saveConfig(request.params.content);
    case "mcp.readProjectConfig":
      return service.mcp.readProjectConfig(request.params.workspaceId);
    case "mcp.server.save":
      return service.mcp.config.saveServer(
        request.params.name,
        request.params.config,
        request.params.previousName,
      );
    case "mcp.server.remove":
      return service.mcp.config.removeServer(request.params.name);
    case "mcp.server.setEnabled":
      return service.mcp.config.setServerEnabled(
        request.params.name,
        request.params.enabled,
      );
    case "mcp.server.setAgents":
      return service.mcp.config.setServerAgents(
        request.params.name,
        request.params.agents,
      );
    case "mcp.injection.check":
      return service.mcp.injectionSupport();
    case "mcp.servers.merge":
      return service.mcp.config.mergeServers(request.params.servers);
    case "mcp.status":
      assertWorkspaceForRemote(
        context,
        "mcp.status",
        request.params.workspaceId,
      );
      return service.mcp.status(
        request.params.workspaceId,
        request.params.names,
      );
    case "mcp.server.test":
      assertWorkspaceForRemote(
        context,
        "mcp.server.test",
        request.params.workspaceId,
      );
      return service.mcp.test(
        request.params.name,
        request.params.config,
        request.params.workspaceId,
      );
    case "mcp.login.start":
      assertWorkspaceForRemote(
        context,
        "mcp.login.start",
        request.params.workspaceId,
      );
      return service.mcp.startLogin(
        request.params.name,
        request.params.workspaceId,
      );
    case "mcp.login.wait":
      return service.mcp.logins.wait(request.params.loginId);
    case "mcp.login.cancel":
      service.mcp.logins.cancel(request.params.loginId);
      return null;
    case "mcp.logout":
      return service.mcp.logout(
        request.params.name,
        request.params.workspaceId,
      );
    case "mcp.import.scan":
      assertLocalPrincipal(context, "mcp.import.scan");
      return service.mcp.scanImports(request.params.workspaceId);
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
    case "provider.model.reset":
      return service.providerService.resetProviderModel(
        request.params.providerId,
        request.params.modelId,
      );
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
    case "provider.listConfigs":
      return service.providerService.listProviderConfigs();
    case "agent.runLimits.get":
      return service.getAgentRunLimits();
    case "agent.runLimits.set":
      return service.setAgentRunLimits(request.params.limits);
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
    case "personalAgent.list":
      return service.personalAgents.list();
    case "personalAgent.create":
      return service.personalAgents.create(request.params);
    case "personalAgent.greet":
      return service.personalAgents.greet(request.params);
    case "personalAgent.update":
      return service.personalAgents.update(request.params);
    case "personalAgent.duplicate":
      return service.personalAgents.duplicate(request.params);
    case "personalAgent.delete":
      await service.personalAgents.delete(request.params.id);
      return null;
    case "personalAgent.work.catalog":
      return service.delegations.catalog();
    case "personalAgent.work.list":
      return service.delegations.list(request.params.personaId);
    case "personalAgent.work.start":
      return service.delegations.start(request.params);
    case "personalAgent.work.send":
      return service.delegations.send(request.params);
    case "personalAgent.work.stop":
      return service.delegations.stop(request.params);
    case "inbox.list":
      return service.listInbox();
    case "inbox.brief":
      return service.getBrief(request.params.timeZone);
    case "inbox.postBrief":
      return service.postBrief(request.params);
    case "inbox.read":
      await service.readInboxItem(request.params.id);
      return null;
    case "routine.list":
      return service.routines.list(request.params.agentId);
    case "routine.get":
      return service.routines.get(request.params.id);
    case "routine.create":
      return service.routines.create(request.params);
    case "routine.update":
      return service.routines.update(request.params);
    case "routine.delete":
      await service.deleteRoutine(request.params.id);
      return null;
    case "routine.run":
      return service.routines.runNow(request.params.id).run;
    case "routine.runs":
      return service.routines.runs(
        request.params.routineId ?? null,
        request.params.limit,
      );
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
