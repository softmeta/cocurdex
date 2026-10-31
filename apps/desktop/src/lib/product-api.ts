import { uploadAttachment } from "./attachment-upload";
import { requestDaemon as rpc } from "./daemon-client";
import type { ProductRequestApi } from "./types";

export const daemonProductApi: ProductRequestApi = {
  bootstrapApp: () => rpc("app.bootstrap"),
  pullSync: (input) => rpc("sync.pull", input),
  getProductSkillsStatus: (scope, workspaceRootPath) =>
    rpc("skills.pack.getStatus", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
  installProductSkills: (scope, workspaceRootPath) =>
    rpc("skills.pack.install", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
  removeProductSkills: (scope, workspaceRootPath) =>
    rpc("skills.pack.remove", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
  listAgents: () => rpc("agent.list"),
  listAgentRoles: () => rpc("agentRole.list"),
  saveAgentRole: (payload) => rpc("agentRole.save", payload),
  deleteAgentRole: async (id) => {
    await rpc("agentRole.delete", { id });
  },
  listWorkflowDefinitions: () => rpc("workflow.listDefinitions"),
  getWorkflowDefinition: (definitionId) =>
    rpc("workflow.getDefinition", { definitionId }),
  saveWorkflowDefinition: (payload) => rpc("workflow.saveDefinition", payload),
  duplicateWorkflowDefinition: (definitionId) =>
    rpc("workflow.duplicateDefinition", { definitionId }),
  deleteWorkflowDefinition: async (definitionId) => {
    await rpc("workflow.deleteDefinition", { definitionId });
  },
  readAdapterRateLimits: (agentIds) =>
    rpc("agent.rateLimits.read", { agentIds }),
  readAgentSessionModes: (agentId) =>
    rpc("agent.sessionModes.read", { agentId }),
  listWorkspaces: () => rpc("workspace.list"),
  saveWorkspace: (workspace) => rpc("workspace.save", { workspace }),
  deleteWorkspace: async (workspaceId) => {
    await rpc("workspace.delete", { workspaceId });
  },
  listHostDirectories: (path) => rpc("fs.listDirectories", { path }),
  getHomeDir: () => rpc("system.homeDir"),
  listFontFamilies: () => rpc("system.fontFamilies"),
  openWorkspaceInFileManager: async (rootPath) => {
    await rpc("system.openDirectory", { path: rootPath });
  },
  revealPathInFileManager: async (targetPath) => {
    await rpc("system.revealPath", { path: targetPath });
  },
  resolveWorkspaceOpenPath: async (filePath) => {
    const rootPath = await rpc("workspace.resolveOpenPath", {
      path: filePath,
      allowFile: true,
    });
    return rootPath ? { rootPath } : null;
  },
  ptySpawn: (payload) => rpc("terminal.spawn", payload),
  ptyWrite: async (terminalId, data) => {
    await rpc("terminal.write", { terminalId, data });
  },
  ptyResize: async (terminalId, cols, rows) => {
    await rpc("terminal.resize", { terminalId, cols, rows });
  },
  ptyKill: async (terminalId) => {
    await rpc("terminal.kill", { terminalId });
  },
  listWorkspaceEntries: (rootPath) =>
    rpc("workspace.listEntries", { rootPath }),
  listWorkspaceFiles: (rootPath) => rpc("workspace.listFiles", { rootPath }),
  listWorkspaceDirectory: (rootPath, relativePath) =>
    rpc("workspace.listDirectory", { rootPath, relativePath }),
  listGitBranches: (rootPath) => rpc("git.listBranches", { rootPath }),
  checkoutGitBranch: async (rootPath, branch) => {
    await rpc("git.checkoutBranch", { rootPath, branch });
  },
  listGitWorktrees: (rootPath) => rpc("git.listWorktrees", { rootPath }),
  addGitWorktree: ({ workspaceId }) => rpc("worktree.create", { workspaceId }),
  getWorktreeSettings: () => rpc("worktree.settings.get"),
  saveWorktreeSettings: (settings) => rpc("worktree.settings.save", settings),
  listManagedWorktrees: () => rpc("worktree.list"),
  removeWorktree: (payload) => rpc("worktree.remove", payload),
  listScriptRuns: (requesterSessionId) =>
    rpc("scriptRun.list", { requesterSessionId }),
  getScriptRun: (runId) => rpc("scriptRun.get", { runId }),
  forkSession: (payload) => rpc("session.fork", payload),
  switchSessionAgent: (sessionId, agentType) =>
    rpc("session.switchAgent", { sessionId, agentType }),
  listContextTransfers: (sessionId) =>
    rpc("session.contextTransfers", { sessionId }),
  getSessionRuntimeState: (sessionId) =>
    rpc("session.runtimeState", { sessionId }),
  getSessionExecutionTree: (sessionId) =>
    rpc("session.executionTree", { sessionId }),
  startScriptRun: (payload) => rpc("scriptRun.start", payload),
  cancelScriptRun: (runId) => rpc("scriptRun.cancel", { runId }),
  getScriptRunSettings: () => rpc("scriptRun.settings.get"),
  saveScriptRunSettings: (settings) => rpc("scriptRun.settings.save", settings),
  getTeam: (leadSessionId) => rpc("team.get", { leadSessionId }),
  createTeam: (payload) => rpc("team.create", payload),
  stopTeam: (teamId) => rpc("team.stop", { teamId }),
  stopTeamMember: (payload) => rpc("team.stopMember", payload),
  listTeamTemplates: () => rpc("teamTemplate.list"),
  saveTeamTemplate: (payload) => rpc("teamTemplate.save", payload),
  deleteTeamTemplate: async (id) => {
    await rpc("teamTemplate.delete", { id });
  },
  getWorktreeEnvironment: (workspaceId) =>
    rpc("workspace.worktreeEnvironment.get", { workspaceId }),
  saveWorktreeEnvironment: (payload) =>
    rpc("workspace.worktreeEnvironment.save", {
      ...payload,
      updatedAt: null,
      proposal: null,
    }),
  createAssistantSession: (workspaceId) =>
    rpc("assistant.session.create", { workspaceId }),
  getOrCreateAssistantSession: (workspaceId) =>
    rpc("assistant.session.getOrCreate", { workspaceId }),
  listPendingSettingsChanges: () => rpc("settings.pendingChanges.list"),
  ackPendingSettingsChange: async (id) => {
    await rpc("settings.pendingChanges.ack", { id });
  },
  reportSettingValues: async (values) => {
    await rpc("settings.values.report", { values });
  },
  listGitCommits: (rootPath, options) =>
    rpc("git.listCommits", { rootPath, limit: options?.limit }),
  getWorkspaceGitDiff: (rootPath, query) =>
    rpc("git.diff", { rootPath, query }),
  getWorkspaceGitStatus: (rootPath) => rpc("git.status", { rootPath }),
  stageGitFiles: async (rootPath, filePaths) => {
    await rpc("git.stageFiles", { rootPath, filePaths });
  },
  unstageGitFiles: async (rootPath, filePaths) => {
    await rpc("git.unstageFiles", { rootPath, filePaths });
  },
  discardGitFiles: async (rootPath, filePaths) => {
    await rpc("git.discardFiles", { rootPath, filePaths });
  },
  commitGitChanges: (rootPath, { message, includeUnstaged }) =>
    rpc("git.commit", { rootPath, message, includeUnstaged }),
  generateGitCommitMessage: (rootPath, { includeUnstaged }) =>
    rpc("git.generateCommitMessage", {
      workspaceRootPath: rootPath,
      includeUnstaged,
    }),
  pushGitBranch: (rootPath) => rpc("git.push", { rootPath }),
  readTextFile: (filePath) => rpc("file.readText", { filePath }),
  fileExists: (filePath) => rpc("file.exists", { filePath }),
  loadPdfAnnotations: ({ filePath }) =>
    rpc("pdf.loadAnnotations", { filePath }),
  updatePdfAnnotations: ({ filePath, operation }) =>
    rpc("pdf.updateAnnotations", { filePath, operation }),
  updateSessionTitle: ({ sessionId, title, expectedTitle, updatedAt }) =>
    rpc("session.updateTitle", { sessionId, title, expectedTitle, updatedAt }),
  setSessionPinned: ({ sessionId, pinned }) =>
    rpc("session.setPinned", { sessionId, pinned }),
  archiveSession: ({ sessionId }) => rpc("session.archive", { sessionId }),
  listArchivedSessions: () => rpc("session.listArchived"),
  restoreSession: ({ sessionId }) => rpc("session.restore", { sessionId }),
  archiveSessions: ({ sessionIds }) =>
    rpc("session.archiveMany", { sessionIds }),
  restoreSessions: ({ sessionIds }) =>
    rpc("session.restoreMany", { sessionIds }),
  deleteSession: async ({ sessionId }) => {
    await rpc("session.delete", { sessionId });
  },
  refineSessionTitle: (payload) => rpc("session.refineTitle", payload),
  listProviderConfigs: () => rpc("provider.listConfigs"),
  listProviderTemplates: () => rpc("provider.listTemplates"),
  readMcpConfig: () => rpc("mcp.readConfig"),
  saveMcpConfig: (content) => rpc("mcp.saveConfig", { content }),
  readMcpProjectConfig: (workspaceId) =>
    rpc("mcp.readProjectConfig", { workspaceId }),
  saveMcpServer: (name, config, previousName) =>
    rpc("mcp.server.save", { name, config, previousName }),
  removeMcpServer: (name) => rpc("mcp.server.remove", { name }),
  setMcpServerEnabled: (name, enabled) =>
    rpc("mcp.server.setEnabled", { name, enabled }),
  setMcpServerAgents: (name, agents) =>
    rpc("mcp.server.setAgents", { name, agents }),
  checkMcpInjection: () => rpc("mcp.injection.check"),
  mergeMcpServers: (servers) => rpc("mcp.servers.merge", { servers }),
  getMcpStatus: (workspaceId, names) =>
    rpc("mcp.status", { workspaceId, names }),
  testMcpServer: (name, config, workspaceId) =>
    rpc("mcp.server.test", { name, config, workspaceId }),
  startMcpLogin: (name, workspaceId) =>
    rpc("mcp.login.start", { name, workspaceId }),
  waitMcpLogin: (loginId) => rpc("mcp.login.wait", { loginId }),
  cancelMcpLogin: async (loginId) => {
    await rpc("mcp.login.cancel", { loginId });
  },
  logoutMcpServer: async (name, workspaceId) => {
    await rpc("mcp.logout", { name, workspaceId });
  },
  scanMcpImports: (workspaceId) => rpc("mcp.import.scan", { workspaceId }),
  saveProviderConfig: (config) => rpc("provider.config.save", { config }),
  deleteProviderConfig: async (providerId) => {
    await rpc("provider.config.delete", { providerId });
  },
  setProviderApiKey: async (providerId, apiKey) => {
    await rpc("provider.apiKey.set", { providerId, apiKey });
  },
  clearProviderApiKey: async (providerId) => {
    await rpc("provider.apiKey.set", { providerId, apiKey: null });
  },
  importProviderJson: (json) => rpc("provider.importJson", { json }),
  readProviderAuth: (providerId) => rpc("provider.auth.read", { providerId }),
  logoutProviderAuth: async (providerId) => {
    await rpc("provider.auth.logout", { providerId });
  },
  listProviderModels: (providerId) =>
    rpc("provider.fetchModels", { providerId }),
  listAllProviderModels: () => rpc("provider.listAllModels", {}),
  saveProviderModel: (model) => rpc("provider.model.save", { model }),
  deleteProviderModel: async (providerId, modelId) => {
    await rpc("provider.model.delete", { providerId, modelId });
  },
  listCompatibleProvidersForAgent: (agentId, options) =>
    rpc("provider.listCompatibleForAgent", {
      agentId,
      forceRefresh: options?.forceRefresh,
    }),
  probeProviderModelAxes: (agentId, modelId) =>
    rpc("provider.modelAxes.probe", { agentId, modelId }),
  loginAgent: async (agentId, methodId) => {
    await rpc("agent.login", { agentId, methodId });
  },
  cancelAgentLogin: async (agentId) => {
    await rpc("agent.login.cancel", { agentId });
  },
  logoutAgent: async (agentId) => {
    await rpc("agent.logout", { agentId });
  },
  readAgentAuth: (agentId) => rpc("agent.auth.read", { agentId }),
  listAcpRegistryCatalog: (options) =>
    rpc("acpRegistry.catalog", options ?? {}),
  installAcpRegistryAgent: (registryId) =>
    rpc("acpRegistry.install", { registryId }),
  installAcpRegistryCommand: (params) =>
    rpc("acpRegistry.installCommand", params),
  uninstallAcpRegistryAgent: async (agentId) => {
    await rpc("acpRegistry.uninstall", { agentId });
  },
  listAgentProviderDefaults: () => rpc("provider.listDefaults"),
  getAgentProviderDefault: (agentId) =>
    rpc("provider.default.get", { agentId }),
  setAgentProviderDefault: async (agentId, providerId, modelId) => {
    await rpc("provider.default.set", { agentId, providerId, modelId });
  },
  getTitleModel: () => rpc("provider.titleModel.get"),
  setTitleModel: async (selection) => {
    await rpc("provider.titleModel.set", { selection });
  },
  probeTitleModel: (selection) =>
    rpc("provider.titleModel.probe", { selection }),
  getCommitMessageModel: () => rpc("git.commitMessageModel.get"),
  setCommitMessageModel: async (selection) => {
    await rpc("git.commitMessageModel.set", { selection });
  },
  getAgentRunLimits: () => rpc("agent.runLimits.get"),
  setAgentRunLimits: (limits) => rpc("agent.runLimits.set", { limits }),
  getNetworkProxySettings: () => rpc("network.proxy.get"),
  setNetworkProxySettings: (settings) => rpc("network.proxy.set", { settings }),
  testNetworkProxy: (settings) => rpc("network.proxy.test", { settings }),
  testCurrentNetworkProxy: () => rpc("network.proxy.test", {}),
  getMemoryStatus: (refresh) => rpc("memory.status", { refresh }),
  getMemorySettings: () => rpc("memory.settings.get"),
  setMemorySettings: (settings) => rpc("memory.settings.set", { settings }),
  recallMemories: (input) => rpc("memory.recall", input),
  showMemory: (id) => rpc("memory.show", { id }),
  rememberMemory: (input) => rpc("memory.remember", input),
  saveSessionMemory: (input) => rpc("memory.session.save", input),
  installMemory: (force) => rpc("memory.install", { force }),
  runMemoryDoctor: (options) => rpc("memory.doctor", options ?? {}),
  getMemoryPolicy: () => rpc("memory.policy"),
  connectMemoryCloud: (input) => rpc("memory.cloud.connect", input),
  disconnectMemoryCloud: () => rpc("memory.cloud.disconnect"),
  setMemoryCloudSync: (enabled) => rpc("memory.cloud.setSync", { enabled }),
  getMemoryCloudKeys: () => rpc("memory.cloud.keys"),
  getHostRemoteAccess: () => rpc("host.remoteAccess.get"),
  setHostRemoteAccess: (settings) => rpc("host.remoteAccess.set", settings),
  setHostRelay: (settings) => rpc("host.relay.set", settings),
  createHostPairing: (payload) => rpc("host.pairing.create", payload),
  listHostPairings: () => rpc("host.pairing.list"),
  cancelHostPairing: (pairingId) => rpc("host.pairing.cancel", { pairingId }),
  listHostDevices: () => rpc("host.devices.list"),
  revokeHostDevice: (deviceId) => rpc("host.devices.revoke", { deviceId }),
  updateHostDeviceScopes: (deviceId, scopes) =>
    rpc("host.devices.updateScopes", { deviceId, scopes }),
  listHostAudit: (limit) => rpc("host.audit.list", { limit }),
  listSessionMessages: (sessionId) =>
    rpc("session.listMessages", { sessionId }),
  listSessionToolCalls: (sessionId) =>
    rpc("session.listToolCalls", { sessionId }),
  getToolCallResult: (toolCallId) =>
    rpc("session.getToolCallResult", { toolCallId }),
  undoTurnChanges: (payload) => rpc("session.undoTurnChanges", payload),
  getTurnChangeFile: (payload) => rpc("session.getTurnChangeFile", payload),
  listTurnChangeSets: (sessionId) =>
    rpc("session.listTurnChangeSets", { sessionId }),
  getTurnChangeDiff: (payload) => rpc("session.getTurnChangeDiff", payload),
  updateQueuedInput: ({ sessionId, messageId, content }) =>
    rpc("session.updateQueued", { sessionId, messageId, content }),
  deleteQueuedInput: async ({ sessionId, messageId }) => {
    await rpc("session.deleteQueued", { sessionId, messageId });
  },
  steerQueuedInput: ({ sessionId, messageId }) =>
    rpc("session.steerQueued", { sessionId, messageId }),
  sendQueuedInputNow: ({ sessionId, messageId }) =>
    rpc("session.sendQueuedNow", { sessionId, messageId }),
  resumeQueuedInputs: (sessionId) => rpc("session.resumeQueued", { sessionId }),
  saveEditorView: async (view) => {
    await rpc("editorView.save", { view });
  },
  listSlashCommands: (agentType, workspaceRootPath) =>
    rpc("session.listSlashCommands", { agentType, workspaceRootPath }),
  setSessionRuntimeMode: async (sessionId, modeId) => {
    await rpc("session.setMode", { sessionId, modeId });
  },
  setSessionRuntimeConfig: (sessionId, configId, value) =>
    rpc("session.setConfig", { sessionId, configId, value }),
  startWorkspaceSearch: async (payload) => {
    await rpc("search.start", payload);
  },
  cancelWorkspaceSearch: async (searchId) => {
    await rpc("search.cancel", { searchId });
  },
  issueListViews: () => rpc("issue.listViews"),
  issueListLinkedSessionIds: () => rpc("issue.listLinkedSessionIds"),
  listSessionAttention: () => rpc("attention.list"),
  updateSessionAttention: (payload) => rpc("attention.update", payload),
  issueLoad: (payload) => rpc("issue.loadView", payload),
  issueGet: (payload) => rpc("issue.get", payload),
  issueCreateView: (payload) => rpc("issue.createView", payload),
  issueDeleteView: async (payload) => {
    await rpc("issue.deleteView", payload);
  },
  issueUpdateView: (payload) => rpc("issue.updateView", payload),
  issueCreateColumn: (payload) => rpc("issue.createColumn", payload),
  issueUpdateColumn: (payload) => rpc("issue.updateColumn", payload),
  issueMoveColumn: (payload) => rpc("issue.moveColumn", payload),
  issueDeleteColumn: async (payload) => {
    await rpc("issue.deleteColumn", payload);
  },
  issueCreate: (payload) => rpc("issue.create", payload),
  issueUpdate: (payload) => rpc("issue.update", payload),
  issueMove: (payload) => rpc("issue.move", payload),
  issueDelete: async (payload) => {
    await rpc("issue.delete", payload);
  },
  issueGetDetail: (payload) => rpc("issue.getDetail", payload),
  issueCreateLabel: (payload) => rpc("issue.createLabel", payload),
  issueUpdateLabel: (payload) => rpc("issue.updateLabel", payload),
  issueDeleteLabel: async (payload) => {
    await rpc("issue.deleteLabel", payload);
  },
  issueAddRelation: (payload) => rpc("issue.addRelation", payload),
  issueRemoveRelation: (payload) => rpc("issue.removeRelation", payload),
  issueComment: (payload) => rpc("issue.comment", payload),
  searchDocuments: (payload) => rpc("search.documents", payload),
  importImageAttachment: (file, name) => uploadAttachment("image", file, name),
  importDocumentAttachment: (file, name) =>
    uploadAttachment("document", file, name),
  startProviderAuthLogin: (providerId, method) =>
    rpc("provider.auth.login.start", { providerId, method }),
  nextProviderAuthLogin: (loginId) =>
    rpc("provider.auth.login.next", { loginId }),
  respondProviderAuthLogin: async (loginId, promptId, value) => {
    await rpc("provider.auth.login.respond", { loginId, promptId, value });
  },
  cancelProviderAuthLogin: async (loginId) => {
    await rpc("provider.auth.login.cancel", { loginId });
  },
};
