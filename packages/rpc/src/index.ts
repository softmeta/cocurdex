import type {
  AcpRegistryAgentId,
  AcpRegistryCatalogAgent,
  AcpRegistryInstalledAgent,
  AgentAuthState,
  AgentDescriptor,
  AgentId,
  AgentMcpUnsupportedReason,
  AgentPlanApprovalDecision,
  AgentProviderModelAxes,
  AgentProviderSelection,
  AgentRateLimitsReadResult,
  AgentRoleRecord,
  AgentRunLimits,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSessionRuntimeState,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  ApplyNoteDocUpdatePayload,
  ArchiveSessionsResult,
  CheckDeckPayload,
  CocurdexDaemonEvent,
  CodexAccountState,
  CodexLoginOutcome,
  CodexLoginStartResult,
  CommentIssuePayload,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  ContextTransferRecord,
  CreateColumnPayload,
  CreateDeckDownloadPayload,
  CreateDeckPayload,
  CreatedHostPairing,
  CreateHostPairingPayload,
  CreateIssueLabelPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateScriptRunPayload,
  CreateSessionPayload,
  CreateTeamPayload,
  CreateViewPayload,
  CreateWorkflowPayload,
  DeckDownload,
  DeckImage,
  DeckIssue,
  DeckRecord,
  DeckSummary,
  DeckWriteResult,
  DeleteColumnPayload,
  DeleteDeckPayload,
  DeleteIssueLabelPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  DiagnosticsExportResult,
  DocImage,
  DocImageFile,
  EditDeckPayload,
  EditorViewRecord,
  EntityLink,
  EntityLinkCandidate,
  EntityLinkPayload,
  ExportDeckFilePayload,
  ExportDeckFileResult,
  ForkSessionPayload,
  GenerateGitCommitMessagePayload,
  GetDeckPayload,
  GetIssueDetailPayload,
  GetIssuePayload,
  GetNoteDocPayload,
  GetNotePayload,
  GetToolCallResultInput,
  GitBranchInfo,
  GitCommitInfo,
  GitCommitResult,
  GitPushResult,
  GitWorktreeInfo,
  HostAccessAuditEntry,
  HostAccessScope,
  HostAccessSession,
  HostDirectoryListing,
  HostIdentity,
  HostPairingRecord,
  HostRemoteAccessStatus,
  ImportDeckImagePayload,
  ImportDeckPayload,
  ImportDocImagePayload,
  InstalledSkillDetail,
  IssueDetail,
  IssueLabel,
  IssueRecord,
  IssueRelationPayload,
  LinkIssueSessionPayload,
  ListEntityLinksPayload,
  LoadViewPayload,
  LocateDocImagePayload,
  LogLevel,
  ManagedWorktree,
  McpConfigFile,
  McpImportCandidate,
  McpLoginOutcome,
  McpLoginStartResult,
  McpProjectConfigFile,
  McpServerConfig,
  McpServerStatus,
  McpStatusReport,
  MemoryCloudConnectInput,
  MemoryCloudConnectResult,
  MemoryCloudKeys,
  MemoryDoctorReport,
  MemoryEntry,
  MemoryInstallResult,
  MemoryRecallResult,
  MemoryRememberInput,
  MemoryRememberResult,
  MemorySessionSaveInput,
  MemorySessionSaveResult,
  MemorySettings,
  MemoryStatus,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxySettings,
  NetworkProxyTestResult,
  NewSessionDefaults,
  NoteBacklinksPayload,
  NoteDocSnapshot,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  PairedDevice,
  PairedDeviceRecord,
  PdfAnnotationsOperation,
  PdfDocumentAnnotations,
  PeerInboundPolicy,
  PeerSessionSummary,
  PendingSettingsChangeRecord,
  PiModelsJson,
  PptxOutline,
  ProductSkillDetail,
  ProductSkillShowPayload,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsRequestPayload,
  ProductSkillsStatusResult,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderImportResult,
  ProviderListModelsResult,
  ProviderModelRecord,
  ProviderTemplateRecord,
  PtyKillPayload,
  PtyResizePayload,
  PtySpawnPayload,
  PtySpawnResult,
  PtyWritePayload,
  ReadPptxPayload,
  RefineSessionTitlePayload,
  RemoteAccessSettingsUpdate,
  ResolvedCommitMessageModel,
  SaveAgentRolePayload,
  SaveTeamTemplatePayload,
  SaveWorkflowDefinitionPayload,
  ScriptRunRecord,
  ScriptRunSettings,
  ScriptRunSnapshot,
  SearchDocumentResult,
  SearchDocumentsPayload,
  SendPeerMessagePayload,
  SendPeerMessageResult,
  SendSessionCommand,
  SessionAttentionSnapshot,
  SessionConfiguration,
  SessionExecutionTree,
  SessionIdsPayload,
  SessionMessagesResult,
  SessionObservationSnapshot,
  SessionRecord,
  SetSessionPinnedPayload,
  SkillAddRequest,
  SkillAddResult,
  SkillAgentLinkPayload,
  SkillCatalogAuditPayload,
  SkillCatalogAuditResult,
  SkillCatalogSearchPayload,
  SkillCatalogSearchResult,
  SkillCatalogSourcesResult,
  SkillLibraryList,
  SkillListPayload,
  SkillRef,
  SkillRemoveResult,
  SkillResolveDuplicatePayload,
  SkillSourceInspectPayload,
  SkillSourceShowPayload,
  SkillSourceSkillDetail,
  SkillSourceSnapshot,
  SkillUpdateCheckResult,
  SkillUpdatePreview,
  SkillUpdateSkipPayload,
  SkillUpdateSkipResult,
  SkillUpdatesApplyPayload,
  SkillUpdatesApplyResult,
  SpawnTeammatePayload,
  SpawnTeamTemplatePayload,
  StartScriptRunPayload,
  SyncPullInput,
  SyncPullResult,
  TeamMemberRecord,
  TeamRecord,
  TeamSnapshot,
  TeamTemplateRecord,
  TitleModelProbeResult,
  TitleModelSelection,
  TurnChangeDiff,
  TurnChangeDiffRequest,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeSet,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
  UpdateColumnPayload,
  UpdateDeckPayload,
  UpdateIssueLabelPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateSessionAttentionPayload,
  UpdateSessionRuntimePayload,
  UpdateSessionTitlePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
  WorkflowAggregate,
  WorkflowDefinitionRecord,
  WorkflowGateDecisionRecord,
  WorkflowRunRecord,
  WorkspaceEntry,
  WorkspaceFileRecord,
  WorkspaceGitDiffQuery,
  WorkspaceGitDiffResult,
  WorkspaceGitStatusResult,
  WorkspaceRecord,
  WorkspaceSearchStartPayload,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
  WorktreeSettingsSnapshot,
} from "@cocurdex/shared";

export {
  DAEMON_WEBSOCKET_PROTOCOL,
  daemonWebSocketProtocols,
  readDaemonWebSocketToken,
} from "./websocket-protocol.ts";

export const DAEMON_PROTOCOL_VERSION = 32;

export interface DaemonMetadata {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  token: string;
  startedAt: string;
  webSocketUrl: string;
  agentToolsUrl?: string;
}

export type DaemonConnectionInfo = Pick<
  DaemonMetadata,
  "webSocketUrl" | "token"
>;

export interface DaemonStatus {
  hostId: string;
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

export interface DaemonActiveWork {
  agentTurns: number;
  queuedInputs: number;
  workflowActive: boolean;
  workspaceSearches: number;
}

export interface DaemonHealth {
  pid: number;
  startedAt: string;
  uptimeSeconds: number;
  platform: string;
  arch: string;
  nodeVersion: string;
  memory: {
    rssBytes: number;
    heapUsedBytes: number;
    heapTotalBytes: number;
    externalBytes: number;
    arrayBuffersBytes: number;
  };
  eventLoop: {
    windowSeconds: number;
    utilization: number;
    delayP50Ms: number;
    delayP99Ms: number;
    delayMaxMs: number;
  };
  activeRequests: number;
  activeWork: DaemonActiveWork;
  connections: { total: number; devices: number };
  agentRuntimes: number;
  terminals: number;
  database: {
    schemaVersion: number;
    sizeBytes: number | null;
    walBytes: number | null;
  };
  logs: { level: LogLevel; directory: string | null };
}

export type DaemonDiagnosticsLogLevel = Extract<LogLevel, "debug" | "info">;

export interface DiagnosticsHostLogDirectory {
  name: string;
  path: string;
}

export interface DiagnosticsExportInput {
  hostLogDirectories?: DiagnosticsHostLogDirectory[];
  hostMetadata?: Record<string, unknown>;
}

export interface DaemonShutdownResult {
  status: "accepted" | "busy";
  activeRequests: number;
  activeWork: DaemonActiveWork;
}

export interface DaemonError {
  code: string;
  message: string;
}

export type DaemonRequestPayloadByMethod = {
  "daemon.status": undefined;
  "daemon.shutdownIfIdle": { pid: number; startedAt: string };
  "daemon.health": undefined;
  "diagnostics.export": DiagnosticsExportInput;
  "diagnostics.logLevel.set": { level: DaemonDiagnosticsLogLevel };
  "app.bootstrap": undefined;
  "sync.pull": SyncPullInput;
  "agent.list": undefined;
  "agent.sessionModes.read": { agentId: AgentId };
  "agent.login": { agentId: AgentId; methodId?: string };
  "agent.login.cancel": { agentId: AgentId };
  "agent.logout": { agentId: AcpRegistryAgentId };
  "agent.auth.read": { agentId: AcpRegistryAgentId };
  "agent.rateLimits.read": { agentIds: AgentId[] };
  "acpRegistry.catalog": { forceRefresh?: boolean };
  "acpRegistry.install": { registryId: string };
  "acpRegistry.installCommand": {
    registryId: string;
    command: string;
    args: string[];
  };
  "acpRegistry.uninstall": { agentId: AcpRegistryAgentId };
  "workspace.list": undefined;
  "workspace.listEntries": { rootPath: string };
  "workspace.listFiles": { rootPath: string };
  "workspace.listDirectory": { rootPath: string; relativePath: string };
  "workspace.save": { workspace: WorkspaceRecord };
  "workspace.delete": { workspaceId: string };
  "workspace.resolveOpenPath": { path: string; allowFile: boolean };
  "editorView.save": { view: EditorViewRecord };
  "workspace.worktreeEnvironment.get": { workspaceId: string };
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
  "assistant.session.create": { workspaceId: string };
  "assistant.session.getOrCreate": { workspaceId: string };
  "settings.pendingChanges.list": undefined;
  "settings.pendingChanges.ack": { id: string };
  "settings.values.report": { values: Record<string, unknown> };
  "workspace.runWorktreeSetup": {
    workspaceId: string;
    worktreePath: string;
  };
  "worktree.settings.get": undefined;
  "worktree.settings.save": WorktreeSettings;
  "worktree.list": undefined;
  "worktree.create": {
    workspaceId: string;
    branch?: string;
    startPoint?: string;
  };
  "worktree.remove": {
    workspaceId: string;
    worktreePath: string;
    workspaceRootPath?: string;
  };
  "session.list": undefined;
  "session.snapshot": { sessionId: string };
  "session.executionTree": { sessionId: string; maxDepth?: number };
  "session.fork": ForkSessionPayload;
  "session.switchAgent": { sessionId: string; agentType: AgentId };
  "session.contextTransfers": { sessionId: string };
  "session.configure": SessionConfiguration;
  "session.create": CreateSessionPayload;
  "session.resolveNew": CreateSessionPayload;
  "session.get": { sessionId: string };
  "session.runtimeState": { sessionId: string };
  "session.listPeers": { sessionId: string };
  "session.sendPeerMessage": SendPeerMessagePayload;
  "session.setPeerInbound": { sessionId: string; policy: PeerInboundPolicy };
  "team.get": { leadSessionId: string };
  "team.create": CreateTeamPayload;
  "team.spawn": { leadSessionId: string } & SpawnTeammatePayload;
  "team.stopMember": { teamId: string; sessionId: string };
  "team.stop": { teamId: string };
  "team.spawnTemplate": { leadSessionId: string } & SpawnTeamTemplatePayload;
  "teamTemplate.list": undefined;
  "teamTemplate.save": SaveTeamTemplatePayload;
  "teamTemplate.delete": { id: string };
  "scriptRun.create": CreateScriptRunPayload;
  "scriptRun.start": StartScriptRunPayload;
  "scriptRun.cancel": { runId: string };
  "scriptRun.get": { runId: string };
  "scriptRun.list": { workspaceId?: string; requesterSessionId?: string };
  "scriptRun.settings.get": undefined;
  "scriptRun.settings.save": ScriptRunSettings;
  "session.delete": { sessionId: string };
  "session.archive": { sessionId: string };
  "session.restore": { sessionId: string };
  "session.archiveMany": SessionIdsPayload;
  "session.restoreMany": SessionIdsPayload;
  "session.listArchived": undefined;
  "provider.apiKey.set": { providerId: string; apiKey: string | null };
  "provider.listTemplates": undefined;
  "provider.config.get": { providerId: string };
  "provider.config.save": { config: ProviderConfigRecord };
  "provider.config.delete": { providerId: string };
  "provider.model.save": { model: ProviderModelRecord };
  "provider.model.delete": { providerId: string; modelId: string };
  "provider.fetchModels": { providerId: string };
  "provider.listAllModels": {
    providerIds?: string[];
    forceRefresh?: boolean;
  };
  "provider.default.get": { agentId: AgentId };
  "provider.default.set": {
    agentId: AgentId;
    providerId: string;
    modelId: string;
  };
  "provider.titleModel.get": undefined;
  "provider.titleModel.set": { selection: TitleModelSelection | null };
  "provider.titleModel.probe": { selection: TitleModelSelection };
  "provider.auth.read": { providerId: string };
  "provider.auth.logout": { providerId: string };
  "provider.auth.login.start": {
    providerId: string;
    method: ProviderAuthMethod;
  };
  "provider.auth.login.next": { loginId: string };
  "provider.auth.login.respond": {
    loginId: string;
    promptId: string;
    value: string;
  };
  "provider.auth.login.cancel": { loginId: string };
  "provider.importJson": { json: string };
  "provider.exportJson": undefined;
  "codex.account.read": undefined;
  "codex.logout": undefined;
  "codex.login.start": undefined;
  "codex.login.wait": { loginId: string };
  "codex.login.cancel": { loginId: string };
  "session.updateTitle": UpdateSessionTitlePayload;
  "session.setPinned": SetSessionPinnedPayload;
  "session.refineTitle": RefineSessionTitlePayload;
  "session.listMessages": { sessionId: string };
  "session.listToolCalls": { sessionId: string };
  "session.listSlashCommands": {
    agentType: AgentId;
    workspaceRootPath: string;
  };
  "session.send": SendSessionCommand;
  "session.resumeQueued": { sessionId: string };
  "session.updateQueued": {
    sessionId: string;
    messageId: string;
    content: string;
  };
  "session.deleteQueued": { sessionId: string; messageId: string };
  "session.steerQueued": { sessionId: string; messageId: string };
  "session.sendQueuedNow": { sessionId: string; messageId: string };
  "session.setConfig": {
    sessionId: string;
    configId: string;
    value: boolean | string;
  };
  "session.setMode": { sessionId: string; modeId: string };
  "session.updateRuntime": UpdateSessionRuntimePayload;
  "session.stop": { sessionId: string };
  "session.undoTurnChanges": UndoTurnChangesInput;
  "session.getTurnChangeFile": TurnChangeFileContentRequest;
  "session.listTurnChangeSets": { sessionId: string };
  "session.getTurnChangeDiff": TurnChangeDiffRequest;
  "session.getToolCallResult": GetToolCallResultInput;
  "daemon.subscribe": { afterSeq?: number; epoch?: string };
  "network.proxy.test": { settings?: NetworkProxySettings };
  "network.proxy.get": undefined;
  "network.proxy.set": { settings: NetworkProxySettings };
  "memory.status": { refresh?: boolean };
  "memory.settings.get": undefined;
  "memory.settings.set": { settings: MemorySettings };
  "memory.recall": {
    query: string;
    limit?: number;
    project?: string | null;
  };
  "memory.show": { id: string };
  "memory.remember": MemoryRememberInput;
  "memory.session.save": MemorySessionSaveInput;
  "memory.install": { force?: boolean };
  "memory.doctor": { remote?: boolean; checkUpdate?: boolean };
  "memory.policy": undefined;
  "memory.cloud.connect": MemoryCloudConnectInput;
  "memory.cloud.disconnect": undefined;
  "memory.cloud.setSync": { enabled: boolean };
  "memory.cloud.keys": undefined;
  "attention.list": undefined;
  "attention.update": UpdateSessionAttentionPayload;
  "file.readText": { filePath: string };
  "file.exists": { filePath: string };
  "fs.listDirectories": { path?: string };
  "system.homeDir": undefined;
  "system.fontFamilies": undefined;
  "system.openDirectory": { path: string };
  "system.revealPath": { path: string };
  "terminal.spawn": PtySpawnPayload;
  "terminal.write": PtyWritePayload;
  "terminal.resize": PtyResizePayload;
  "terminal.kill": PtyKillPayload;
  "search.start": WorkspaceSearchStartPayload;
  "search.cancel": { searchId: string };
  "mcp.readConfig": undefined;
  "mcp.saveConfig": { content: string };
  "mcp.readProjectConfig": { workspaceId: string };
  "mcp.server.save": {
    name: string;
    config: McpServerConfig;
    previousName?: string;
  };
  "mcp.server.remove": { name: string };
  "mcp.server.setEnabled": { name: string; enabled: boolean };
  "mcp.server.setAgents": { name: string; agents: AgentId[] };
  "mcp.injection.check": undefined;
  "mcp.servers.merge": { servers: Record<string, McpServerConfig> };
  "mcp.status": { workspaceId?: string; names?: string[] };
  "mcp.server.test": {
    name: string;
    config: McpServerConfig;
    workspaceId?: string;
  };
  "mcp.login.start": { name: string; workspaceId?: string };
  "mcp.login.wait": { loginId: string };
  "mcp.login.cancel": { loginId: string };
  "mcp.logout": { name: string; workspaceId?: string };
  "mcp.import.scan": { workspaceId?: string };
  "skills.pack.getStatus": ProductSkillsRequestPayload;
  "skills.pack.install": ProductSkillsRequestPayload;
  "skills.pack.remove": ProductSkillsRequestPayload;
  "skills.pack.show": ProductSkillShowPayload;
  "skills.list": SkillListPayload;
  "skills.show": SkillRef;
  "skills.remove": SkillRef;
  "skills.setAgentLink": SkillAgentLinkPayload;
  "skills.share": SkillRef;
  "skills.resolveDuplicate": SkillResolveDuplicatePayload;
  "skills.catalog.search": SkillCatalogSearchPayload;
  "skills.catalog.sources": undefined;
  "skills.catalog.audit": SkillCatalogAuditPayload;
  "skills.source.inspect": SkillSourceInspectPayload;
  "skills.source.show": SkillSourceShowPayload;
  "skills.add": SkillAddRequest;
  "skills.updates.check": SkillListPayload;
  "skills.updates.preview": SkillRef;
  "skills.updates.apply": SkillUpdatesApplyPayload;
  "skills.updates.skip": SkillUpdateSkipPayload;
  "pdf.loadAnnotations": { filePath: string };
  "pdf.updateAnnotations": {
    filePath: string;
    operation: PdfAnnotationsOperation;
  };
  "note.list": undefined;
  "note.get": GetNotePayload;
  "note.getDoc": GetNoteDocPayload;
  "note.applyDocUpdate": ApplyNoteDocUpdatePayload;
  "note.create": CreateNotePayload;
  "note.update": UpdateNotePayload;
  "note.move": MoveNotePayload;
  "note.delete": DeleteNotePayload;
  "note.listTags": { noteId?: string };
  "note.backlinks": NoteBacklinksPayload;
  "link.list": ListEntityLinksPayload;
  "link.candidates": undefined;
  "link.add": EntityLinkPayload;
  "link.remove": EntityLinkPayload;
  "deck.list": undefined;
  "deck.get": GetDeckPayload;
  "deck.create": CreateDeckPayload;
  "deck.update": UpdateDeckPayload;
  "deck.edit": EditDeckPayload;
  "deck.delete": DeleteDeckPayload;
  "deck.check": CheckDeckPayload;
  "deck.createDownload": CreateDeckDownloadPayload;
  "deck.exportFile": ExportDeckFilePayload;
  "deck.importImage": ImportDeckImagePayload;
  "deck.import": ImportDeckPayload;
  "image.import": ImportDocImagePayload;
  "image.locate": LocateDocImagePayload;
  "deck.readPptx": ReadPptxPayload;
  "issue.listViews": undefined;
  "issue.loadView": LoadViewPayload;
  "issue.createView": CreateViewPayload;
  "issue.updateView": UpdateViewPayload;
  "issue.deleteView": DeleteViewPayload;
  "issue.createColumn": CreateColumnPayload;
  "issue.updateColumn": UpdateColumnPayload;
  "issue.moveColumn": MoveColumnPayload;
  "issue.deleteColumn": DeleteColumnPayload;
  "issue.get": GetIssuePayload;
  "issue.create": CreateIssuePayload;
  "issue.update": UpdateIssuePayload;
  "issue.move": MoveIssuePayload;
  "issue.delete": DeleteIssuePayload;
  "issue.getDetail": GetIssueDetailPayload;
  "issue.listLabels": undefined;
  "issue.createLabel": CreateIssueLabelPayload;
  "issue.updateLabel": UpdateIssueLabelPayload;
  "issue.deleteLabel": DeleteIssueLabelPayload;
  "issue.addRelation": IssueRelationPayload;
  "issue.removeRelation": IssueRelationPayload;
  "issue.comment": CommentIssuePayload;
  "issue.linkSession": LinkIssueSessionPayload;
  "issue.listLinkedSessionIds": undefined;
  "search.documents": SearchDocumentsPayload;
  "workflow.list": undefined;
  "workflow.get": { workflowRunId: string };
  "workflow.listDefinitions": undefined;
  "workflow.getDefinition": { definitionId: string };
  "workflow.saveDefinition": SaveWorkflowDefinitionPayload;
  "workflow.duplicateDefinition": { definitionId: string };
  "workflow.deleteDefinition": { definitionId: string };
  "workflow.create": CreateWorkflowPayload;
  "workflow.start": { workflowRunId: string };
  "workflow.decideGate": {
    workflowRunId: string;
    stepId: string;
    decision: WorkflowGateDecisionRecord["decision"];
    actor?: WorkflowGateDecisionRecord["actor"];
    reason?: string;
  };
  "workflow.cancel": { workflowRunId: string };
  "permission.resolve": {
    requestId: string;
    optionId: string;
  };
  "question.resolve": { questionId: string; answer: string };
  "planApproval.resolve": {
    approvalId: string;
    decision: AgentPlanApprovalDecision;
  };
  "provider.listConfigs": undefined;
  "agent.runLimits.get": undefined;
  "agent.runLimits.set": { limits: AgentRunLimits };
  "git.commitMessageModel.get": undefined;
  "git.commitMessageModel.set": {
    selection: CommitMessageModelSelection | null;
  };
  "git.commitMessageModel.resolve": undefined;
  "git.generateCommitMessage": GenerateGitCommitMessagePayload;
  "git.listBranches": { rootPath: string };
  "git.checkoutBranch": { rootPath: string; branch: string };
  "git.listWorktrees": { rootPath: string };
  "git.listCommits": { rootPath: string; limit?: number };
  "git.status": { rootPath: string };
  "git.diff": { rootPath: string; query?: WorkspaceGitDiffQuery };
  "git.stageFiles": { rootPath: string; filePaths: string[] };
  "git.unstageFiles": { rootPath: string; filePaths: string[] };
  "git.discardFiles": { rootPath: string; filePaths: string[] };
  "git.commit": { rootPath: string; message: string; includeUnstaged: boolean };
  "git.push": { rootPath: string };
  "provider.listModels": { providerId?: string };
  "provider.listCompatibleForAgent": {
    agentId: AgentId;
    forceRefresh?: boolean;
  };
  "provider.modelAxes.probe": { agentId: AgentId; modelId: string };
  "provider.listDefaults": undefined;
  "agentRole.list": undefined;
  "agentRole.get": { id: string };
  "agentRole.save": SaveAgentRolePayload;
  "agentRole.delete": { id: string };
  "host.identity": undefined;
  "host.session": undefined;
  "host.remoteAccess.get": undefined;
  "host.remoteAccess.set": RemoteAccessSettingsUpdate;
  "host.pairing.create": CreateHostPairingPayload;
  "host.pairing.list": undefined;
  "host.pairing.cancel": { pairingId: string };
  "host.devices.list": undefined;
  "host.devices.revoke": { deviceId: string };
  "host.devices.revokeSelf": undefined;
  "host.devices.updateScopes": { deviceId: string; scopes: HostAccessScope[] };
  "host.audit.list": { limit?: number };
};

export type DaemonResultByMethod = {
  "daemon.status": DaemonStatus;
  "daemon.shutdownIfIdle": DaemonShutdownResult;
  "daemon.health": DaemonHealth;
  "diagnostics.export": DiagnosticsExportResult;
  "diagnostics.logLevel.set": { level: DaemonDiagnosticsLogLevel };
  "app.bootstrap": AppBootstrapData;
  "sync.pull": SyncPullResult;
  "agent.list": AgentDescriptor[];
  "agent.sessionModes.read": AgentSessionMode[];
  "agent.login": null;
  "agent.login.cancel": null;
  "agent.logout": null;
  "agent.auth.read": AgentAuthState;
  "agent.rateLimits.read": Partial<Record<AgentId, AgentRateLimitsReadResult>>;
  "acpRegistry.catalog": AcpRegistryCatalogAgent[];
  "acpRegistry.install": AcpRegistryInstalledAgent;
  "acpRegistry.installCommand": AcpRegistryInstalledAgent;
  "acpRegistry.uninstall": null;
  "workspace.list": WorkspaceRecord[];
  "workspace.listEntries": WorkspaceEntry[];
  "workspace.listFiles": WorkspaceFileRecord[];
  "workspace.listDirectory": WorkspaceFileRecord[];
  "workspace.save": WorkspaceRecord;
  "workspace.delete": null;
  "workspace.resolveOpenPath": string | null;
  "editorView.save": null;
  "workspace.worktreeEnvironment.get": WorkspaceWorktreeEnvironment;
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
  "assistant.session.create": SessionRecord;
  "assistant.session.getOrCreate": SessionRecord;
  "settings.pendingChanges.list": PendingSettingsChangeRecord[];
  "settings.pendingChanges.ack": null;
  "settings.values.report": null;
  "workspace.runWorktreeSetup": { ran: boolean };
  "worktree.settings.get": WorktreeSettingsSnapshot;
  "worktree.settings.save": WorktreeSettingsSnapshot;
  "worktree.list": ManagedWorktree[];
  "worktree.create": GitWorktreeInfo;
  "worktree.remove": { removed: boolean };
  "session.list": SessionRecord[];
  "session.listPeers": PeerSessionSummary[];
  "session.sendPeerMessage": SendPeerMessageResult;
  "session.setPeerInbound": SessionRecord;
  "team.get": TeamSnapshot | null;
  "team.create": TeamRecord;
  "team.spawn": TeamMemberRecord;
  "team.stopMember": TeamMemberRecord;
  "team.stop": TeamRecord;
  "team.spawnTemplate": TeamMemberRecord[];
  "teamTemplate.list": TeamTemplateRecord[];
  "teamTemplate.save": TeamTemplateRecord;
  "teamTemplate.delete": null;
  "scriptRun.create": ScriptRunRecord;
  "scriptRun.start": ScriptRunRecord;
  "scriptRun.cancel": ScriptRunRecord;
  "scriptRun.get": ScriptRunSnapshot;
  "scriptRun.list": ScriptRunRecord[];
  "scriptRun.settings.get": ScriptRunSettings;
  "scriptRun.settings.save": ScriptRunSettings;
  "session.snapshot": SessionObservationSnapshot | null;
  "session.executionTree": SessionExecutionTree | null;
  "session.fork": SessionRecord;
  "session.switchAgent": SessionRecord;
  "session.contextTransfers": ContextTransferRecord[];
  "session.configure": SessionRecord;
  "session.create": SessionRecord;
  "session.resolveNew": NewSessionDefaults;
  "session.get": SessionRecord | null;
  "session.runtimeState": AgentSessionRuntimeState;
  "session.delete": null;
  "session.archive": SessionRecord | null;
  "session.restore": SessionRecord[];
  "session.archiveMany": ArchiveSessionsResult;
  "session.restoreMany": SessionRecord[];
  "session.listArchived": SessionRecord[];
  "provider.apiKey.set": null;
  "provider.listTemplates": ProviderTemplateRecord[];
  "provider.config.get": ProviderConfigRecord | null;
  "provider.config.save": ProviderConfigRecord;
  "provider.config.delete": null;
  "provider.model.save": ProviderModelRecord;
  "provider.model.delete": null;
  "provider.fetchModels": ProviderListModelsResult;
  "provider.listAllModels": ProviderModelRecord[];
  "provider.default.get": AgentProviderSelection | null;
  "provider.default.set": null;
  "provider.titleModel.get": TitleModelSelection | null;
  "provider.titleModel.set": null;
  "provider.titleModel.probe": TitleModelProbeResult;
  "provider.auth.read": ProviderAuthState;
  "provider.auth.logout": null;
  "provider.auth.login.start": { loginId: string };
  "provider.auth.login.next": ProviderAuthLoginUpdate;
  "provider.auth.login.respond": null;
  "provider.auth.login.cancel": null;
  "provider.importJson": ProviderImportResult;
  "provider.exportJson": PiModelsJson;
  "codex.account.read": CodexAccountState;
  "codex.logout": null;
  "codex.login.start": CodexLoginStartResult;
  "codex.login.wait": CodexLoginOutcome;
  "codex.login.cancel": null;
  "session.updateTitle": SessionRecord | null;
  "session.setPinned": SessionRecord | null;
  "session.refineTitle": SessionRecord | null;
  "session.listMessages": SessionMessagesResult;
  "session.listToolCalls": AgentToolCallRecord[];
  "session.listSlashCommands": AgentSlashCommand[];
  "session.send": MessageRecord;
  "session.resumeQueued": boolean;
  "session.updateQueued": MessageRecord;
  "session.deleteQueued": null;
  "session.steerQueued": MessageRecord;
  "session.sendQueuedNow": MessageRecord;
  "session.setConfig": AgentSessionConfigOption[];
  "session.setMode": null;
  "session.updateRuntime": SessionRecord;
  "session.stop": null;
  "session.undoTurnChanges": UndoTurnChangesResult;
  "session.getTurnChangeFile": TurnChangeFileContent;
  "session.listTurnChangeSets": TurnChangeSet[];
  "session.getTurnChangeDiff": TurnChangeDiff;
  "session.getToolCallResult": AgentToolCallResult | null;
  "daemon.subscribe": DaemonSubscribeResult;
  "network.proxy.test": NetworkProxyTestResult;
  "network.proxy.get": NetworkProxySettings;
  "network.proxy.set": NetworkProxySettings;
  "memory.status": MemoryStatus;
  "memory.settings.get": MemorySettings;
  "memory.settings.set": MemorySettings;
  "memory.recall": MemoryRecallResult;
  "memory.show": MemoryEntry | null;
  "memory.remember": MemoryRememberResult;
  "memory.session.save": MemorySessionSaveResult;
  "memory.install": MemoryInstallResult;
  "memory.doctor": MemoryDoctorReport;
  "memory.policy": string;
  "memory.cloud.connect": MemoryCloudConnectResult;
  "memory.cloud.disconnect": MemoryStatus;
  "memory.cloud.setSync": MemoryStatus;
  "memory.cloud.keys": MemoryCloudKeys;
  "attention.list": SessionAttentionSnapshot[];
  "attention.update": SessionAttentionSnapshot;
  "file.readText": string;
  "file.exists": boolean;
  "fs.listDirectories": HostDirectoryListing;
  "system.homeDir": string;
  "system.fontFamilies": string[];
  "system.openDirectory": null;
  "system.revealPath": null;
  "terminal.spawn": PtySpawnResult;
  "terminal.write": null;
  "terminal.resize": null;
  "terminal.kill": null;
  "search.start": null;
  "search.cancel": null;
  "mcp.readConfig": McpConfigFile;
  "mcp.saveConfig": McpConfigFile;
  "mcp.readProjectConfig": McpProjectConfigFile;
  "mcp.server.save": McpConfigFile;
  "mcp.server.remove": McpConfigFile;
  "mcp.server.setEnabled": McpConfigFile;
  "mcp.server.setAgents": McpConfigFile;
  "mcp.injection.check": Record<string, AgentMcpUnsupportedReason | null>;
  "mcp.servers.merge": McpConfigFile;
  "mcp.status": McpStatusReport;
  "mcp.server.test": McpServerStatus;
  "mcp.login.start": McpLoginStartResult;
  "mcp.login.wait": McpLoginOutcome;
  "mcp.login.cancel": null;
  "mcp.logout": { removed: boolean };
  "mcp.import.scan": McpImportCandidate[];
  "skills.pack.getStatus": ProductSkillsStatusResult;
  "skills.pack.install": ProductSkillsInstallResult;
  "skills.pack.remove": ProductSkillsRemoveResult;
  "skills.pack.show": ProductSkillDetail;
  "skills.list": SkillLibraryList;
  "skills.show": InstalledSkillDetail;
  "skills.remove": SkillRemoveResult;
  "skills.setAgentLink": InstalledSkillDetail;
  "skills.share": InstalledSkillDetail;
  "skills.resolveDuplicate": InstalledSkillDetail;
  "skills.catalog.search": SkillCatalogSearchResult;
  "skills.catalog.sources": SkillCatalogSourcesResult;
  "skills.catalog.audit": SkillCatalogAuditResult;
  "skills.source.inspect": SkillSourceSnapshot;
  "skills.source.show": SkillSourceSkillDetail;
  "skills.add": SkillAddResult;
  "skills.updates.check": SkillUpdateCheckResult;
  "skills.updates.preview": SkillUpdatePreview;
  "skills.updates.apply": SkillUpdatesApplyResult;
  "skills.updates.skip": SkillUpdateSkipResult;
  "pdf.loadAnnotations": PdfDocumentAnnotations;
  "pdf.updateAnnotations": PdfDocumentAnnotations;
  "note.list": NoteSummary[];
  "note.get": NoteRecord | null;
  "note.getDoc": NoteDocSnapshot | null;
  "note.applyDocUpdate": NoteRecord;
  "note.create": NoteRecord;
  "note.update": NoteRecord;
  "note.move": NoteRecord;
  "note.delete": null;
  "note.listTags": NoteTag[];
  "note.backlinks": NoteLink[];
  "link.list": EntityLink[];
  "link.candidates": EntityLinkCandidate[];
  "link.add": boolean;
  "link.remove": boolean;
  "deck.list": DeckSummary[];
  "deck.get": DeckRecord | null;
  "deck.create": DeckWriteResult;
  "deck.update": DeckWriteResult;
  "deck.edit": DeckWriteResult;
  "deck.delete": null;
  "deck.check": DeckIssue[];
  "deck.createDownload": DeckDownload;
  "deck.exportFile": ExportDeckFileResult;
  "deck.importImage": DeckImage;
  "deck.import": DeckWriteResult;
  "image.import": DocImage;
  "image.locate": DocImageFile | null;
  "deck.readPptx": PptxOutline;
  "issue.listViews": ViewSummary[];
  "issue.loadView": ViewFull | null;
  "issue.createView": ViewSummary;
  "issue.updateView": ViewFull;
  "issue.deleteView": null;
  "issue.createColumn": ViewColumnRecord;
  "issue.updateColumn": ViewColumnRecord;
  "issue.moveColumn": ViewColumnRecord;
  "issue.deleteColumn": null;
  "issue.get": IssueRecord | null;
  "issue.create": IssueRecord;
  "issue.update": IssueRecord;
  "issue.move": IssueRecord;
  "issue.delete": null;
  "issue.getDetail": IssueDetail | null;
  "issue.listLabels": IssueLabel[];
  "issue.createLabel": IssueLabel;
  "issue.updateLabel": IssueLabel;
  "issue.deleteLabel": null;
  "issue.addRelation": IssueDetail;
  "issue.removeRelation": IssueDetail;
  "issue.comment": IssueDetail;
  "issue.linkSession": boolean;
  "issue.listLinkedSessionIds": string[];
  "search.documents": SearchDocumentResult[];
  "workflow.list": WorkflowRunRecord[];
  "workflow.get": WorkflowAggregate | null;
  "workflow.listDefinitions": WorkflowDefinitionRecord[];
  "workflow.getDefinition": WorkflowDefinitionRecord | null;
  "workflow.saveDefinition": WorkflowDefinitionRecord;
  "workflow.duplicateDefinition": WorkflowDefinitionRecord;
  "workflow.deleteDefinition": null;
  "workflow.create": WorkflowAggregate;
  "workflow.start": WorkflowAggregate;
  "workflow.decideGate": WorkflowAggregate;
  "workflow.cancel": WorkflowAggregate;
  "permission.resolve": boolean;
  "question.resolve": boolean;
  "planApproval.resolve": boolean;
  "provider.listConfigs": ProviderConfigRecord[];
  "agent.runLimits.get": AgentRunLimits;
  "agent.runLimits.set": AgentRunLimits;
  "git.commitMessageModel.get": CommitMessageModelSelection | null;
  "git.commitMessageModel.set": null;
  "git.commitMessageModel.resolve": ResolvedCommitMessageModel;
  "git.generateCommitMessage": string;
  "git.listBranches": GitBranchInfo[];
  "git.checkoutBranch": undefined;
  "git.listWorktrees": GitWorktreeInfo[];
  "git.listCommits": GitCommitInfo[];
  "git.status": WorkspaceGitStatusResult;
  "git.diff": WorkspaceGitDiffResult;
  "git.stageFiles": undefined;
  "git.unstageFiles": undefined;
  "git.discardFiles": undefined;
  "git.commit": GitCommitResult;
  "git.push": GitPushResult;
  "provider.listModels": ProviderListModelsResult;
  "provider.listCompatibleForAgent": CompatibleProviderModel[];
  "provider.modelAxes.probe": AgentProviderModelAxes | null;
  "provider.listDefaults": AgentProviderSelection[];
  "agentRole.list": AgentRoleRecord[];
  "agentRole.get": AgentRoleRecord | null;
  "agentRole.save": AgentRoleRecord;
  "agentRole.delete": null;
  "host.identity": HostIdentity;
  "host.session": HostAccessSession;
  "host.remoteAccess.get": HostRemoteAccessStatus;
  "host.remoteAccess.set": HostRemoteAccessStatus;
  "host.pairing.create": CreatedHostPairing;
  "host.pairing.list": HostPairingRecord[];
  "host.pairing.cancel": HostPairingRecord | null;
  "host.devices.list": PairedDevice[];
  "host.devices.revoke": PairedDeviceRecord | null;
  "host.devices.revokeSelf": PairedDeviceRecord | null;
  "host.devices.updateScopes": PairedDeviceRecord | null;
  "host.audit.list": HostAccessAuditEntry[];
};

export type DaemonMethod = keyof DaemonRequestPayloadByMethod;

type DaemonNoParamMethod = {
  [M in DaemonMethod]: DaemonRequestPayloadByMethod[M] extends undefined
    ? M
    : never;
}[DaemonMethod];

/**
 * Runtime catalog of methods whose payload is `undefined`. Must stay in lockstep
 * with `DaemonRequestPayloadByMethod`: missing or extra keys fail typecheck.
 * The client uses this to tell `{ userDataPath }` options apart from params.
 */
export const DAEMON_NO_PARAM_METHODS = {
  "agent.list": true,
  "app.bootstrap": true,
  "attention.list": true,
  "daemon.status": true,
  "daemon.health": true,
  "system.fontFamilies": true,
  "system.homeDir": true,
  "host.identity": true,
  "host.session": true,
  "host.remoteAccess.get": true,
  "host.pairing.list": true,
  "host.devices.list": true,
  "host.devices.revokeSelf": true,
  "issue.listViews": true,
  "issue.listLabels": true,
  "issue.listLinkedSessionIds": true,
  "teamTemplate.list": true,
  "memory.settings.get": true,
  "memory.policy": true,
  "memory.cloud.disconnect": true,
  "memory.cloud.keys": true,
  "scriptRun.settings.get": true,
  "mcp.readConfig": true,
  "mcp.injection.check": true,
  "skills.catalog.sources": true,
  "deck.list": true,
  "link.candidates": true,
  "note.list": true,
  "provider.listConfigs": true,
  "provider.listTemplates": true,
  "provider.titleModel.get": true,
  "codex.account.read": true,
  "codex.logout": true,
  "codex.login.start": true,
  "network.proxy.get": true,
  "agent.runLimits.get": true,
  "git.commitMessageModel.get": true,
  "git.commitMessageModel.resolve": true,
  "provider.listDefaults": true,
  "provider.exportJson": true,
  "agentRole.list": true,
  "session.list": true,
  "session.listArchived": true,
  "settings.pendingChanges.list": true,
  "workflow.list": true,
  "workflow.listDefinitions": true,
  "workspace.list": true,
  "worktree.list": true,
  "worktree.settings.get": true,
} as const satisfies Record<DaemonNoParamMethod, true>;

export function daemonMethodHasNoParams(
  method: DaemonMethod,
): method is DaemonNoParamMethod {
  return Object.hasOwn(DAEMON_NO_PARAM_METHODS, method);
}

export type DaemonRequest<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]: DaemonRequestPayloadByMethod[Method] extends undefined
    ? { id: string; method: Method; token: string; idempotencyKey?: string }
    : {
        id: string;
        method: Method;
        params: DaemonRequestPayloadByMethod[Method];
        token: string;
        idempotencyKey?: string;
      };
}[M];

export type DaemonResponse<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]:
    | { id: string; result: DaemonResultByMethod[Method] }
    | { error: DaemonError; id: string };
}[M];

// Epoch identifies one daemon lifetime (its start timestamp). Sequence numbers
// restart with each lifetime, so a client must only reuse afterSeq within the
// epoch that produced it. replayGap tells the subscriber the journaled replay
// was incomplete and authoritative state must be refetched.
export interface DaemonSubscribeResult {
  epoch: string;
  replayGap: boolean;
}

export interface DaemonEventEnvelope {
  event: CocurdexDaemonEvent;
  seq?: number;
  type: "daemon.event";
}

export type DaemonWireMessage =
  | DaemonRequest
  | DaemonResponse
  | DaemonEventEnvelope;
