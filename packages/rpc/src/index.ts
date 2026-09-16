import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentProviderSelection,
  AgentProviderSnapshot,
  AgentRateLimitsReadResult,
  AgentRoleRecord,
  AgentRuntimeProviderConfig,
  AgentSessionConfigOption,
  AgentSlashCommand,
  AgentToolCallResult,
  AgentToolCatalog,
  AppBootstrapData,
  AppResyncSnapshot,
  CocurdexDaemonEvent,
  CodexAccountState,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  ConversationMessageRecord,
  ConversationRecord,
  ConversationSnapshot,
  CreateColumnPayload,
  CreateConversationPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateViewPayload,
  CreateWorkflowPayload,
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  EditConversationMessagePayload,
  GenerateGitCommitMessagePayload,
  GetIssuePayload,
  GetNotePayload,
  GetToolCallResultInput,
  GitBranchInfo,
  GitCommitInfo,
  GitCommitResult,
  GitPushResult,
  GitWorktreeInfo,
  HostDirectoryListing,
  IssueRecord,
  LoadViewPayload,
  ManagedWorktree,
  McpConfigFile,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxyTestResult,
  NoteBacklinksPayload,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  PdfDocumentAnnotations,
  PeerInboundPolicy,
  PeerSessionSummary,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsRequestPayload,
  ProductSkillsStatusResult,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderListModelsResult,
  ProviderModelRecord,
  ProviderTemplateRecord,
  ResolvedCommitMessageModel,
  RetryConversationMessagePayload,
  SaveAgentRolePayload,
  SaveWorkflowDefinitionPayload,
  SearchDocumentResult,
  SearchDocumentsPayload,
  SendConversationMessagePayload,
  SendPeerMessagePayload,
  SendPeerMessageResult,
  SendSessionCommand,
  SessionAttentionSnapshot,
  SessionConfiguration,
  SessionObservationSnapshot,
  SessionRecord,
  SubmitPreviousMessageCommand,
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
  UpdateConversationPayload,
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

export const DAEMON_PROTOCOL_VERSION = 24;

export interface DaemonMetadata {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  token: string;
  startedAt: string;
  webSocketUrl?: string;
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
  chatOperations: number;
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
  "chat.list": undefined;
  "chat.get": { conversationId: string };
  "chat.create": CreateConversationPayload;
  "chat.update": UpdateConversationPayload;
  "chat.archive": { conversationId: string };
  "chat.delete": { conversationId: string };
  "chat.stop": { conversationId: string };
  "chat.send": {
    message: SendConversationMessagePayload;
    providerConfig: AgentRuntimeProviderConfig;
    titleProviderConfig?: AgentRuntimeProviderConfig | null;
  };
  "chat.retry": {
    message: RetryConversationMessagePayload;
    providerConfig: AgentRuntimeProviderConfig;
  };
  "chat.edit": {
    message: EditConversationMessagePayload;
    providerConfig: AgentRuntimeProviderConfig;
  };
  "daemon.status": undefined;
  "daemon.shutdownIfIdle": { pid: number; startedAt: string };
  "app.bootstrap": undefined;
  "app.resync": { sessionIds: string[] };
  "agent.list": undefined;
  "agent.rateLimits.read": { agentIds: AgentId[] };
  "workspace.list": undefined;
  "workspace.listEntries": { rootPath: string };
  "workspace.listFiles": { rootPath: string };
  "workspace.save": { workspace: WorkspaceRecord };
  "workspace.worktreeEnvironment.get": { workspaceId: string };
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
  "workspace.runWorktreeSetup": {
    workspaceId: string;
    worktreePath: string;
  };
  "worktree.settings.get": undefined;
  "worktree.settings.save": WorktreeSettings;
  "worktree.list": undefined;
  "worktree.create": {
    workspaceId: string;
    branch: string;
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
  "agentTool.catalog": { token: string };
  "agentTool.call": { token: string; name: string; input: unknown };
  "session.delete": { sessionId: string };
  "session.archive": { sessionId: string };
  "session.restore": { sessionId: string };
  "session.listArchived": undefined;
  "provider.apiKey.set": { providerId: string; apiKey: string | null };
  "provider.apiKey.read": { providerId: string };
  "provider.resolveSnapshot": { snapshot: AgentProviderSnapshot };
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
  "codex.account.read": undefined;
  "codex.logout": undefined;
  "session.updateTitle": UpdateSessionTitlePayload;
  "session.generateTitle": { sessionId: string; message: string };
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
  "network.proxy.test": undefined;
  "attention.list": undefined;
  "attention.update": UpdateSessionAttentionPayload;
  "storage.call": { operation: string; args: unknown[] };
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
  "pdf.saveAnnotations": {
    filePath: string;
    annotations: PdfDocumentAnnotations;
  };
  "note.list": undefined;
  "note.get": GetNotePayload;
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
    decision: AgentPermissionDecision;
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
  "provider.listDefaults": undefined;
  "agentRole.list": undefined;
  "agentRole.get": { id: string };
  "agentRole.save": SaveAgentRolePayload;
  "agentRole.delete": { id: string };
};

export type DaemonResultByMethod = {
  "chat.list": ConversationRecord[];
  "chat.get": ConversationSnapshot | null;
  "chat.create": ConversationRecord;
  "chat.update": ConversationRecord;
  "chat.archive": ConversationRecord;
  "chat.delete": null;
  "chat.stop": null;
  "chat.send": ConversationMessageRecord;
  "chat.retry": null;
  "chat.edit": ConversationMessageRecord;
  "daemon.status": DaemonStatus;
  "daemon.shutdownIfIdle": DaemonShutdownResult;
  "app.bootstrap": AppBootstrapData;
  "app.resync": AppResyncSnapshot;
  "agent.list": AgentDescriptor[];
  "agent.rateLimits.read": Partial<Record<AgentId, AgentRateLimitsReadResult>>;
  "workspace.list": WorkspaceRecord[];
  "workspace.listEntries": WorkspaceEntry[];
  "workspace.listFiles": WorkspaceFileRecord[];
  "workspace.save": WorkspaceRecord;
  "workspace.worktreeEnvironment.get": WorkspaceWorktreeEnvironment;
  "workspace.worktreeEnvironment.save": WorkspaceWorktreeEnvironment;
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
  "agentTool.catalog": AgentToolCatalog;
  "agentTool.call": unknown;
  "session.snapshot": SessionObservationSnapshot | null;
  "session.configure": SessionRecord;
  "session.get": SessionRecord | null;
  "session.delete": null;
  "session.archive": SessionRecord | null;
  "session.restore": SessionRecord[];
  "session.listArchived": SessionRecord[];
  "provider.apiKey.set": null;
  "provider.apiKey.read": string | null;
  "provider.resolveSnapshot": AgentRuntimeProviderConfig;
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
  "codex.account.read": CodexAccountState;
  "codex.logout": null;
  "session.updateTitle": SessionRecord | null;
  "session.generateTitle": string | null;
  "session.listSlashCommands": AgentSlashCommand[];
  "session.resubmit": MessageRecord;
  "session.checkpointStatus": { available: boolean };
  "session.send": MessageRecord;
  "session.resumeQueued": boolean;
  "session.updateQueued": MessageRecord;
  "session.deleteQueued": null;
  "session.steerQueued": MessageRecord;
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
  "attention.list": SessionAttentionSnapshot[];
  "attention.update": SessionAttentionSnapshot;
  "storage.call": unknown;
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
  "pdf.saveAnnotations": null;
  "note.list": NoteSummary[];
  "note.get": NoteRecord | null;
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
  "chat.list": true,
  "agent.list": true,
  "app.bootstrap": true,
  "attention.list": true,
  "daemon.status": true,
  "issue.listViews": true,
  "mcp.readConfig": true,
  "network.proxy.test": true,
  "note.list": true,
  "provider.listConfigs": true,
  "provider.listTemplates": true,
  "provider.titleModel.get": true,
  "codex.account.read": true,
  "codex.logout": true,
  "git.commitMessageModel.get": true,
  "git.commitMessageModel.resolve": true,
  "provider.listDefaults": true,
  "agentRole.list": true,
  "session.list": true,
  "session.listArchived": true,
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
