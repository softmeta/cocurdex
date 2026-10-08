import type {
  AcpRegistryAgentId,
  AcpRegistryCatalogAgent,
  AcpRegistryInstalledAgent,
  AgentDescriptor,
  AgentId,
  AgentPlanApprovalDecision,
  AgentProviderModelAxes,
  AgentProviderSelection,
  AgentRateLimitsReadResult,
  AgentRoleRecord,
  AgentSessionConfigOption,
  AgentSessionMode,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  ApplyNoteDocUpdatePayload,
  AppResyncSnapshot,
  CocurdexDaemonEvent,
  CodexAccountState,
  CodexLoginOutcome,
  CodexLoginStartResult,
  CommentIssuePayload,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  CreateColumnPayload,
  CreateIssueLabelPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateScriptRunPayload,
  CreateTeamPayload,
  CreateViewPayload,
  CreateWorkflowPayload,
  DeleteColumnPayload,
  DeleteIssueLabelPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  DocumentAttachment,
  EditorViewRecord,
  GenerateGitCommitMessagePayload,
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
  HostDirectoryListing,
  ImageAttachment,
  ImportDocumentAttachmentPayload,
  ImportImageAttachmentPayload,
  IssueDetail,
  IssueLabel,
  IssueRecord,
  IssueRelationPayload,
  LinkIssueSessionPayload,
  LoadViewPayload,
  ManagedWorktree,
  McpConfigFile,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxySettings,
  NetworkProxyTestResult,
  NoteBacklinksPayload,
  NoteDocSnapshot,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  PdfAnnotationsOperation,
  PdfDocumentAnnotations,
  PeerInboundPolicy,
  PeerSessionSummary,
  PendingSettingsChangeRecord,
  PiModelsJson,
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
  RefineSessionTitlePayload,
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
  SessionMessagesResult,
  SessionObservationSnapshot,
  SessionRecord,
  SpawnTeammatePayload,
  SpawnTeamTemplatePayload,
  StartScriptRunPayload,
  SubmitPreviousMessageCommand,
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
  UpdateIssueLabelPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateSessionAttentionPayload,
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

export const DAEMON_PROTOCOL_VERSION = 25;

export interface DaemonMetadata {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  token: string;
  startedAt: string;
  webSocketUrl?: string;
  agentToolsUrl?: string;
}

export interface DaemonStatus {
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
  "app.bootstrap": undefined;
  "app.resync": { sessionIds: string[] };
  "agent.list": undefined;
  "agent.sessionModes.read": { agentId: AgentId };
  "agent.login": { agentId: AgentId };
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
  "session.configure": SessionConfiguration;
  "session.get": { sessionId: string };
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
  "session.refineTitle": RefineSessionTitlePayload;
  "session.listMessages": { sessionId: string };
  "session.listToolCalls": { sessionId: string };
  "session.listSlashCommands": {
    agentType: AgentId;
    workspaceRootPath: string;
  };
  "session.resubmit": SubmitPreviousMessageCommand;
  "session.checkpointStatus": { sessionId: string; messageId: string };
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
  "attention.list": undefined;
  "attention.update": UpdateSessionAttentionPayload;
  "attachment.importImage": ImportImageAttachmentPayload;
  "attachment.importDocument": ImportDocumentAttachmentPayload;
  "attachment.readImageDataUrl": { filePath: string };
  "file.readText": { filePath: string };
  "file.exists": { filePath: string };
  "fs.listDirectories": { path?: string };
  "search.start": WorkspaceSearchStartPayload;
  "search.cancel": { searchId: string };
  "mcp.readConfig": undefined;
  "mcp.saveConfig": { content: string };
  "skills.getStatus": ProductSkillsRequestPayload;
  "skills.install": ProductSkillsRequestPayload;
  "skills.remove": ProductSkillsRequestPayload;
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
};

export type DaemonResultByMethod = {
  "daemon.status": DaemonStatus;
  "daemon.shutdownIfIdle": DaemonShutdownResult;
  "app.bootstrap": AppBootstrapData;
  "app.resync": AppResyncSnapshot;
  "agent.list": AgentDescriptor[];
  "agent.sessionModes.read": AgentSessionMode[];
  "agent.login": null;
  "agent.rateLimits.read": Partial<Record<AgentId, AgentRateLimitsReadResult>>;
  "acpRegistry.catalog": AcpRegistryCatalogAgent[];
  "acpRegistry.install": AcpRegistryInstalledAgent;
  "acpRegistry.installCommand": AcpRegistryInstalledAgent;
  "acpRegistry.uninstall": null;
  "workspace.list": WorkspaceRecord[];
  "workspace.listEntries": WorkspaceEntry[];
  "workspace.listFiles": WorkspaceFileRecord[];
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
  "session.configure": SessionRecord;
  "session.get": SessionRecord | null;
  "session.delete": null;
  "session.archive": SessionRecord | null;
  "session.restore": SessionRecord[];
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
  "session.refineTitle": SessionRecord | null;
  "session.listMessages": SessionMessagesResult;
  "session.listToolCalls": AgentToolCallRecord[];
  "session.listSlashCommands": AgentSlashCommand[];
  "session.resubmit": MessageRecord;
  "session.checkpointStatus": { available: boolean };
  "session.send": MessageRecord;
  "session.resumeQueued": boolean;
  "session.updateQueued": MessageRecord;
  "session.deleteQueued": null;
  "session.steerQueued": MessageRecord;
  "session.sendQueuedNow": MessageRecord;
  "session.setConfig": AgentSessionConfigOption[];
  "session.setMode": null;
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
  "attention.list": SessionAttentionSnapshot[];
  "attention.update": SessionAttentionSnapshot;
  "attachment.importImage": ImageAttachment;
  "attachment.importDocument": DocumentAttachment;
  "attachment.readImageDataUrl": string;
  "file.readText": string;
  "file.exists": boolean;
  "fs.listDirectories": HostDirectoryListing;
  "search.start": null;
  "search.cancel": null;
  "mcp.readConfig": McpConfigFile;
  "mcp.saveConfig": McpConfigFile;
  "skills.getStatus": ProductSkillsStatusResult;
  "skills.install": ProductSkillsInstallResult;
  "skills.remove": ProductSkillsRemoveResult;
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
  "issue.listViews": true,
  "issue.listLabels": true,
  "teamTemplate.list": true,
  "scriptRun.settings.get": true,
  "mcp.readConfig": true,
  "note.list": true,
  "provider.listConfigs": true,
  "provider.listTemplates": true,
  "provider.titleModel.get": true,
  "codex.account.read": true,
  "codex.logout": true,
  "codex.login.start": true,
  "network.proxy.get": true,
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
  seq: number;
  type: "daemon.event";
}

export type DaemonWireMessage =
  | DaemonRequest
  | DaemonResponse
  | DaemonEventEnvelope;
