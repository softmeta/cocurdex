import type { DaemonConnectionInfo } from "@cocurdex/rpc";
import type {
  AcpRegistryAgentId,
  AcpRegistryCatalogAgent,
  AcpRegistryInstalledAgent,
  AgentAuthState,
  AgentDescriptor,
  AgentId,
  AgentMcpUnsupportedReason,
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
  ArchiveSessionPayload,
  ArchiveSessionsResult,
  BrowserAnnotation,
  BrowserTabsSnapshot,
  CocurdexDataChangedEvent,
  CommentIssuePayload,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  ContextTransferRecord,
  CreateColumnPayload,
  CreatedHostPairing,
  CreateHostPairingPayload,
  CreateIssueLabelPayload,
  CreateIssuePayload,
  CreateTeamPayload,
  CreateViewPayload,
  DeleteColumnPayload,
  DeleteIssueLabelPayload,
  DeleteIssuePayload,
  DeleteSessionPayload,
  DeleteViewPayload,
  DiagnosticsExportResult,
  DocumentAttachment,
  EditorViewRecord,
  ForkSessionPayload,
  GetIssueDetailPayload,
  GetIssuePayload,
  GitBranchInfo,
  GitCommitInfo,
  GitWorktreeInfo,
  HostAccessAuditEntry,
  HostAccessScope,
  HostDirectoryListing,
  HostPairingRecord,
  HostRemoteAccessStatus,
  ImageAttachment,
  IssueDetail,
  IssueLabel,
  IssueRecord,
  IssueRelationPayload,
  LoadViewPayload,
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
  NetworkProxySettings,
  NetworkProxyTestResult,
  PairedDeviceRecord,
  PdfAnnotationsOperation,
  PdfDocumentAnnotations,
  PendingSettingsChangeRecord,
  ProductSkillScope,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsStatusResult,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderImportResult,
  ProviderListModelsResult,
  ProviderModelRecord,
  ProviderTemplateRecord,
  PtyActivityEvent,
  PtyDataEvent,
  PtyExitEvent,
  PtySpawnPayload,
  PtySpawnResult,
  QueuedAgentInputActionPayload,
  RefineSessionTitlePayload,
  RemoteAccessSettingsUpdate,
  RendererLogPayload,
  SaveAgentRolePayload,
  SaveTeamTemplatePayload,
  SaveWorkflowDefinitionPayload,
  ScriptRunRecord,
  ScriptRunSettings,
  ScriptRunSnapshot,
  SearchDocumentResult,
  SearchDocumentsPayload,
  SessionAttentionSnapshot,
  SessionExecutionTree,
  SessionIdsPayload,
  SessionMessagesResult,
  SessionRecord,
  SetSessionPinnedPayload,
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
  UpdateIssueLabelPayload,
  UpdateIssuePayload,
  UpdateQueuedAgentInputPayload,
  UpdateSessionAttentionPayload,
  UpdateSessionTitlePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
  WorkflowDefinitionRecord,
  WorkspaceAction,
  WorkspaceEntry,
  WorkspaceFileRecord,
  WorkspaceGitDiffQuery,
  WorkspaceGitDiffResult,
  WorkspaceGitStatusResult,
  WorkspaceRecord,
  WorkspaceSearchDoneEvent,
  WorkspaceSearchErrorEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchMatchRange,
  WorkspaceSearchResultEvent,
  WorkspaceSearchStartPayload,
  WorkspaceWorktreeEnvironment,
  WorktreeSettings,
  WorktreeSettingsSnapshot,
} from "@cocurdex/shared";
import type { ChatWindowApi } from "./chat-window-types";

export type WorkspaceFileEntry = WorkspaceFileRecord;
export type ProductSkillsStatus = ProductSkillsStatusResult;
export type PdfDocumentAnnotationsDto = PdfDocumentAnnotations;
export type PdfAnnotationsOperationDto = PdfAnnotationsOperation;
export type {
  ProductSkillScope,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  WorkspaceEntry,
  WorkspaceSearchDoneEvent,
  WorkspaceSearchErrorEvent,
  WorkspaceSearchMatch,
  WorkspaceSearchMatchRange,
  WorkspaceSearchResultEvent,
  WorkspaceSearchStartPayload,
};

export interface BrowserAnnotationEvent {
  tabId: string;
  annotation: BrowserAnnotation;
  submit: boolean;
}

export interface BrowserAnnotationActionEvent {
  tabId: string;
  action: "send" | "clear" | "exit";
}

export type BrowserViewAnchor = "start" | "end" | "stretch";

export interface BrowserViewBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  viewportWidth: number;
  viewportHeight: number;
  anchorX?: BrowserViewAnchor;
  anchorY?: BrowserViewAnchor;
}

export interface WorkspaceFilesChangedEvent {
  rootPath: string;
  changedPaths?: string[];
}

export type {
  GitBranchInfo,
  GitChangeKind,
  GitCommitInfo,
  GitContentsOmittedReason,
  GitDiffScopeMode,
  GitFileStagedState,
  GitRefKind,
  WorkspaceGitDiffQuery,
  WorkspaceGitDiffResult,
  WorkspaceGitDiffStatus,
  WorkspaceGitFileChange,
  WorkspaceGitStatusEntry,
  WorkspaceGitStatusResult,
  WorkspaceGitTreeStatus,
} from "@cocurdex/shared";

/** Status of the `cocurdex` shell command install (PATH). */
export interface CliPathStatus {
  available: boolean;
  installed: boolean;
  pointsToCurrentApp: boolean;
  binDir: string;
  installPath: string;
  sourcePath: string | null;
  binDirOnPath: boolean;
  pathHint: string | null;
  error: string | null;
}

export type AppUpdateChannel = "stable" | "test";

export type AppUpdateStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "ready"
  | "unsupported";

export interface AppUpdateState {
  availableVersion: string | null;
  channel: AppUpdateChannel;
  currentVersion: string;
  dismissedVersion: string | null;
  downloadPercent: number | null;
  errorMessage: string | null;
  releaseNotesUrl: string | null;
  status: AppUpdateStatus;
}

export type OssLicenseKind = "app" | "native" | "package";

export interface OssLicenseEntry {
  homepage: string | null;
  id: string;
  kind: OssLicenseKind;
  license: string;
  name: string;
  textId: string | null;
  version: string | null;
}

export interface OssLicensesPayload {
  chromiumAvailable: boolean;
  entries: OssLicenseEntry[];
  texts: Record<string, string>;
}

/** Local Cocurdex daemon process health (no auth token). */
export interface DaemonRuntimeStatus {
  running: boolean;
  pid: number | null;
  protocolVersion: number | null;
  runtimeFingerprint: string | null;
  expectedRuntimeFingerprint: string | null;
  socketPath: string | null;
  startedAt: string | null;
  matchesRuntime: boolean;
  ownedByThisApp: boolean;
  error: string | null;
}

/**
 * What the client host can do locally. A browser client connected to a remote
 * daemon reports these as absent so UI can hide host-only actions.
 */
export interface HostCapabilities {
  /** The host can open or reveal paths in the OS file manager. */
  fileManager: boolean;
  /**
   * The host can show a native directory picker. Clients without it use the
   * daemon `fs.listDirectories` browse RPC to pick paths on the daemon host.
   */
  nativeDirectoryDialog: boolean;
  terminal: boolean;
  browserView: boolean;
  localWebClient: boolean;
  localFilePaths: boolean;
}

/**
 * Product surface backed by daemon RPC — the contract every client (desktop,
 * web, mobile) shares. Members map to named `@cocurdex/rpc` methods or to
 * daemon events bridged by the host. Host-only abilities live in
 * {@link HostApi}.
 */
export interface ProductApi {
  bootstrapApp(): Promise<AppBootstrapData>;
  // Authoritative reload after a daemon event replay gap; the snapshot's
  // eventSeq boundary tells the client which buffered events it covers.
  pullSync(input: SyncPullInput): Promise<SyncPullResult>;
  getProductSkillsStatus(
    scope: ProductSkillScope,
    workspaceRootPath?: string | null,
  ): Promise<ProductSkillsStatus>;
  installProductSkills(
    scope: ProductSkillScope,
    workspaceRootPath?: string | null,
  ): Promise<ProductSkillsInstallResult>;
  removeProductSkills(
    scope: ProductSkillScope,
    workspaceRootPath?: string | null,
  ): Promise<ProductSkillsRemoveResult>;
  listAgents(): Promise<AgentDescriptor[]>;
  listAgentRoles(): Promise<AgentRoleRecord[]>;
  saveAgentRole(payload: SaveAgentRolePayload): Promise<AgentRoleRecord>;
  deleteAgentRole(id: string): Promise<void>;
  listWorkflowDefinitions(): Promise<WorkflowDefinitionRecord[]>;
  getWorkflowDefinition(
    definitionId: string,
  ): Promise<WorkflowDefinitionRecord | null>;
  saveWorkflowDefinition(
    payload: SaveWorkflowDefinitionPayload,
  ): Promise<WorkflowDefinitionRecord>;
  duplicateWorkflowDefinition(
    definitionId: string,
  ): Promise<WorkflowDefinitionRecord>;
  deleteWorkflowDefinition(definitionId: string): Promise<void>;
  readAdapterRateLimits(
    agentIds: AgentId[],
  ): Promise<Partial<Record<AgentId, AgentRateLimitsReadResult>>>;
  readAgentSessionModes(agentId: AgentId): Promise<AgentSessionMode[]>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  saveWorkspace(workspace: WorkspaceRecord): Promise<WorkspaceRecord>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  /**
   * List directories on the daemon host (for picking a workspace root when no
   * native directory dialog is available). Paths are daemon-host absolute.
   */
  listHostDirectories(path?: string): Promise<HostDirectoryListing>;
  getHomeDir(): Promise<string>;
  listFontFamilies(): Promise<string[]>;
  openWorkspaceInFileManager(rootPath: string): Promise<void>;
  revealPathInFileManager(targetPath: string): Promise<void>;
  resolveWorkspaceOpenPath(
    filePath: string,
  ): Promise<{ rootPath: string } | null>;
  ptySpawn(payload: PtySpawnPayload): Promise<PtySpawnResult>;
  ptyWrite(terminalId: string, data: string): Promise<void>;
  ptyResize(terminalId: string, cols: number, rows: number): Promise<void>;
  ptyKill(terminalId: string): Promise<void>;
  onPtyData(listener: (event: PtyDataEvent) => void): () => void;
  onPtyExit(listener: (event: PtyExitEvent) => void): () => void;
  onPtyActivity(listener: (event: PtyActivityEvent) => void): () => void;
  listWorkspaceEntries(rootPath: string): Promise<WorkspaceEntry[]>;
  listWorkspaceFiles(rootPath: string): Promise<WorkspaceFileEntry[]>;
  listWorkspaceDirectory(
    rootPath: string,
    relativePath: string,
  ): Promise<WorkspaceFileEntry[]>;
  listGitBranches(rootPath: string): Promise<GitBranchInfo[]>;
  checkoutGitBranch(rootPath: string, branch: string): Promise<void>;
  listGitWorktrees(rootPath: string): Promise<GitWorktreeInfo[]>;
  addGitWorktree(payload: {
    repoRootPath: string;
    workspaceId: string;
  }): Promise<GitWorktreeInfo>;
  getWorktreeSettings(): Promise<WorktreeSettingsSnapshot>;
  saveWorktreeSettings(
    settings: WorktreeSettings,
  ): Promise<WorktreeSettingsSnapshot>;
  listManagedWorktrees(): Promise<ManagedWorktree[]>;
  removeWorktree(payload: {
    workspaceId: string;
    worktreePath: string;
    workspaceRootPath?: string;
  }): Promise<{ removed: boolean }>;
  listScriptRuns(requesterSessionId: string): Promise<ScriptRunRecord[]>;
  getScriptRun(runId: string): Promise<ScriptRunSnapshot>;
  forkSession(payload: ForkSessionPayload): Promise<SessionRecord>;
  switchSessionAgent(
    sessionId: string,
    agentType: AgentId,
  ): Promise<SessionRecord>;
  listContextTransfers(sessionId: string): Promise<ContextTransferRecord[]>;
  getSessionRuntimeState(sessionId: string): Promise<AgentSessionRuntimeState>;
  getSessionExecutionTree(
    sessionId: string,
  ): Promise<SessionExecutionTree | null>;
  startScriptRun(payload: StartScriptRunPayload): Promise<ScriptRunRecord>;
  cancelScriptRun(runId: string): Promise<ScriptRunRecord>;
  getScriptRunSettings(): Promise<ScriptRunSettings>;
  saveScriptRunSettings(
    settings: ScriptRunSettings,
  ): Promise<ScriptRunSettings>;
  getTeam(leadSessionId: string): Promise<TeamSnapshot | null>;
  createTeam(payload: CreateTeamPayload): Promise<TeamRecord>;
  stopTeam(teamId: string): Promise<TeamRecord>;
  stopTeamMember(payload: {
    teamId: string;
    sessionId: string;
  }): Promise<TeamMemberRecord>;
  listTeamTemplates(): Promise<TeamTemplateRecord[]>;
  saveTeamTemplate(
    payload: SaveTeamTemplatePayload,
  ): Promise<TeamTemplateRecord>;
  deleteTeamTemplate(id: string): Promise<void>;
  getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment>;
  saveWorktreeEnvironment(payload: {
    workspaceId: string;
    setupScript: string;
    cleanupScript: string;
    actions: WorkspaceAction[];
  }): Promise<WorkspaceWorktreeEnvironment>;
  createAssistantSession(workspaceId: string): Promise<SessionRecord>;
  getOrCreateAssistantSession(workspaceId: string): Promise<SessionRecord>;
  listPendingSettingsChanges(): Promise<PendingSettingsChangeRecord[]>;
  ackPendingSettingsChange(id: string): Promise<void>;
  reportSettingValues(values: Record<string, unknown>): Promise<void>;
  listGitCommits(
    rootPath: string,
    options?: { limit?: number },
  ): Promise<GitCommitInfo[]>;
  getWorkspaceGitDiff(
    rootPath: string,
    query?: WorkspaceGitDiffQuery,
  ): Promise<WorkspaceGitDiffResult>;
  // Lightweight porcelain status for explorer tree git signs (no contents).
  getWorkspaceGitStatus(rootPath: string): Promise<WorkspaceGitStatusResult>;
  // Add files' working-tree changes to the index in a single git invocation.
  stageGitFiles(rootPath: string, filePaths: string[]): Promise<void>;
  // Remove files from the index, leaving their working-tree changes intact.
  unstageGitFiles(rootPath: string, filePaths: string[]): Promise<void>;
  // Drop files' staged and unstaged changes, restoring them to HEAD (or
  // removing those that were newly added, untracked-at-HEAD files).
  discardGitFiles(rootPath: string, filePaths: string[]): Promise<void>;
  // Commit staged changes; optionally stage the whole worktree first. Empty
  // message → Conventional Commits subject generated from the staged set.
  commitGitChanges(
    rootPath: string,
    options: { message: string; includeUnstaged: boolean },
  ): Promise<{
    commitHash: string;
    message: string;
    generatedMessage: boolean;
  }>;
  // One-shot draft for the commit message field (no stage/commit side effects).
  generateGitCommitMessage(
    rootPath: string,
    options: { includeUnstaged: boolean },
  ): Promise<string>;
  // Push the current branch to its upstream (or set upstream on origin).
  pushGitBranch(rootPath: string): Promise<{ branch: string; remote: string }>;
  readTextFile(filePath: string): Promise<string>;
  fileExists(filePath: string): Promise<boolean>;
  // Per-document bookmarks + highlights in app private storage (userData).
  loadPdfAnnotations(payload: {
    filePath: string;
  }): Promise<PdfDocumentAnnotationsDto>;
  updatePdfAnnotations(payload: {
    filePath: string;
    operation: PdfAnnotationsOperationDto;
  }): Promise<PdfDocumentAnnotationsDto>;
  updateSessionTitle(
    payload: UpdateSessionTitlePayload,
  ): Promise<SessionRecord | null>;
  setSessionPinned(
    payload: SetSessionPinnedPayload,
  ): Promise<SessionRecord | null>;
  archiveSession(payload: ArchiveSessionPayload): Promise<SessionRecord | null>;
  listArchivedSessions(): Promise<SessionRecord[]>;
  restoreSession(payload: { sessionId: string }): Promise<SessionRecord[]>;
  archiveSessions(payload: SessionIdsPayload): Promise<ArchiveSessionsResult>;
  restoreSessions(payload: SessionIdsPayload): Promise<SessionRecord[]>;
  deleteSession(payload: DeleteSessionPayload): Promise<void>;
  refineSessionTitle(
    payload: RefineSessionTitlePayload,
  ): Promise<SessionRecord | null>;
  listProviderConfigs(): Promise<ProviderConfigRecord[]>;
  listProviderTemplates(): Promise<ProviderTemplateRecord[]>;
  readMcpConfig(): Promise<{ content: string; path: string }>;
  saveMcpConfig(content: string): Promise<{ content: string; path: string }>;
  readMcpProjectConfig(workspaceId: string): Promise<McpProjectConfigFile>;
  saveMcpServer(
    name: string,
    config: McpServerConfig,
    previousName?: string,
  ): Promise<McpConfigFile>;
  removeMcpServer(name: string): Promise<McpConfigFile>;
  setMcpServerEnabled(name: string, enabled: boolean): Promise<McpConfigFile>;
  setMcpServerAgents(name: string, agents: AgentId[]): Promise<McpConfigFile>;
  checkMcpInjection(): Promise<
    Record<string, AgentMcpUnsupportedReason | null>
  >;
  mergeMcpServers(
    servers: Record<string, McpServerConfig>,
  ): Promise<McpConfigFile>;
  getMcpStatus(
    workspaceId?: string,
    names?: string[],
  ): Promise<McpStatusReport>;
  testMcpServer(
    name: string,
    config: McpServerConfig,
    workspaceId?: string,
  ): Promise<McpServerStatus>;
  startMcpLogin(
    name: string,
    workspaceId?: string,
  ): Promise<McpLoginStartResult>;
  waitMcpLogin(loginId: string): Promise<McpLoginOutcome>;
  cancelMcpLogin(loginId: string): Promise<void>;
  logoutMcpServer(name: string, workspaceId?: string): Promise<void>;
  scanMcpImports(workspaceId?: string): Promise<McpImportCandidate[]>;
  saveProviderConfig(
    config: ProviderConfigRecord,
  ): Promise<ProviderConfigRecord>;
  deleteProviderConfig(providerId: string): Promise<void>;
  setProviderApiKey(providerId: string, apiKey: string): Promise<void>;
  clearProviderApiKey(providerId: string): Promise<void>;
  importProviderJson(json: string): Promise<ProviderImportResult>;
  readProviderAuth(providerId: string): Promise<ProviderAuthState>;
  logoutProviderAuth(providerId: string): Promise<void>;
  listProviderModels(providerId: string): Promise<ProviderListModelsResult>;
  listAllProviderModels(): Promise<ProviderModelRecord[]>;
  saveProviderModel(model: ProviderModelRecord): Promise<ProviderModelRecord>;
  deleteProviderModel(providerId: string, modelId: string): Promise<void>;
  listCompatibleProvidersForAgent(
    agentId: AgentId,
    options?: { forceRefresh?: boolean },
  ): Promise<CompatibleProviderModel[]>;
  probeProviderModelAxes(
    agentId: AgentId,
    modelId: string,
  ): Promise<AgentProviderModelAxes | null>;
  loginAgent(agentId: AgentId, methodId?: string): Promise<void>;
  cancelAgentLogin(agentId: AgentId): Promise<void>;
  logoutAgent(agentId: AcpRegistryAgentId): Promise<void>;
  readAgentAuth(agentId: AcpRegistryAgentId): Promise<AgentAuthState>;
  listAcpRegistryCatalog(options?: {
    forceRefresh?: boolean;
  }): Promise<AcpRegistryCatalogAgent[]>;
  installAcpRegistryAgent(
    registryId: string,
  ): Promise<AcpRegistryInstalledAgent>;
  installAcpRegistryCommand(params: {
    registryId: string;
    command: string;
    args: string[];
  }): Promise<AcpRegistryInstalledAgent>;
  uninstallAcpRegistryAgent(agentId: AcpRegistryAgentId): Promise<void>;
  listAgentProviderDefaults(): Promise<AgentProviderSelection[]>;
  getAgentProviderDefault(
    agentId: AgentId,
  ): Promise<AgentProviderSelection | null>;
  setAgentProviderDefault(
    agentId: AgentId,
    providerId: string,
    modelId: string,
  ): Promise<void>;
  getTitleModel(): Promise<TitleModelSelection | null>;
  setTitleModel(selection: TitleModelSelection | null): Promise<void>;
  probeTitleModel(
    selection: TitleModelSelection,
  ): Promise<TitleModelProbeResult>;
  getCommitMessageModel(): Promise<CommitMessageModelSelection | null>;
  setCommitMessageModel(
    selection: CommitMessageModelSelection | null,
  ): Promise<void>;
  getAgentRunLimits(): Promise<AgentRunLimits>;
  setAgentRunLimits(limits: AgentRunLimits): Promise<AgentRunLimits>;
  getNetworkProxySettings(): Promise<NetworkProxySettings>;
  setNetworkProxySettings(
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings>;
  testNetworkProxy(
    settings: NetworkProxySettings,
  ): Promise<NetworkProxyTestResult>;
  testCurrentNetworkProxy(): Promise<NetworkProxyTestResult>;
  getMemoryStatus(refresh?: boolean): Promise<MemoryStatus>;
  getMemorySettings(): Promise<MemorySettings>;
  setMemorySettings(settings: MemorySettings): Promise<MemorySettings>;
  recallMemories(input: {
    query: string;
    limit?: number;
    project?: string | null;
  }): Promise<MemoryRecallResult>;
  showMemory(id: string): Promise<MemoryEntry | null>;
  rememberMemory(input: MemoryRememberInput): Promise<MemoryRememberResult>;
  saveSessionMemory(
    input: MemorySessionSaveInput,
  ): Promise<MemorySessionSaveResult>;
  installMemory(force?: boolean): Promise<MemoryInstallResult>;
  runMemoryDoctor(options?: {
    remote?: boolean;
    checkUpdate?: boolean;
  }): Promise<MemoryDoctorReport>;
  getMemoryPolicy(): Promise<string>;
  connectMemoryCloud(
    input: MemoryCloudConnectInput,
  ): Promise<MemoryCloudConnectResult>;
  disconnectMemoryCloud(): Promise<MemoryStatus>;
  setMemoryCloudSync(enabled: boolean): Promise<MemoryStatus>;
  getMemoryCloudKeys(): Promise<MemoryCloudKeys>;
  getHostRemoteAccess(): Promise<HostRemoteAccessStatus>;
  setHostRemoteAccess(
    settings: RemoteAccessSettingsUpdate,
  ): Promise<HostRemoteAccessStatus>;
  createHostPairing(
    payload: CreateHostPairingPayload,
  ): Promise<CreatedHostPairing>;
  listHostPairings(): Promise<HostPairingRecord[]>;
  cancelHostPairing(pairingId: string): Promise<HostPairingRecord | null>;
  listHostDevices(): Promise<PairedDeviceRecord[]>;
  revokeHostDevice(deviceId: string): Promise<PairedDeviceRecord | null>;
  updateHostDeviceScopes(
    deviceId: string,
    scopes: HostAccessScope[],
  ): Promise<PairedDeviceRecord | null>;
  listHostAudit(limit: number): Promise<HostAccessAuditEntry[]>;
  listSessionMessages(sessionId: string): Promise<SessionMessagesResult>;
  listSessionToolCalls(sessionId: string): Promise<AgentToolCallRecord[]>;
  // Returns user-facing content and raw machine output for a single tool call.
  // Summary-only session records hydrate this result on user demand.
  getToolCallResult(toolCallId: string): Promise<AgentToolCallResult | null>;
  undoTurnChanges(
    payload: UndoTurnChangesInput,
  ): Promise<UndoTurnChangesResult>;
  getTurnChangeFile(
    payload: TurnChangeFileContentRequest,
  ): Promise<TurnChangeFileContent>;
  listTurnChangeSets(sessionId: string): Promise<TurnChangeSet[]>;
  getTurnChangeDiff(payload: TurnChangeDiffRequest): Promise<TurnChangeDiff>;
  updateQueuedInput(
    payload: UpdateQueuedAgentInputPayload,
  ): Promise<MessageRecord>;
  deleteQueuedInput(payload: QueuedAgentInputActionPayload): Promise<void>;
  steerQueuedInput(
    payload: QueuedAgentInputActionPayload,
  ): Promise<MessageRecord>;
  sendQueuedInputNow(
    payload: QueuedAgentInputActionPayload,
  ): Promise<MessageRecord>;
  resumeQueuedInputs(sessionId: string): Promise<boolean>;
  saveEditorView(view: EditorViewRecord): Promise<void>;
  listSlashCommands(
    agentType: AgentId,
    workspaceRootPath: string,
  ): Promise<AgentSlashCommand[]>;
  setSessionRuntimeMode(sessionId: string, modeId: string): Promise<void>;
  setSessionRuntimeConfig(
    sessionId: string,
    configId: string,
    value: boolean | string,
  ): Promise<AgentSessionConfigOption[]>;
  startWorkspaceSearch(payload: WorkspaceSearchStartPayload): Promise<void>;
  cancelWorkspaceSearch(searchId: string): Promise<void>;
  onWorkspaceSearchResult(
    listener: (event: WorkspaceSearchResultEvent) => void,
  ): () => void;
  onWorkspaceSearchDone(
    listener: (event: WorkspaceSearchDoneEvent) => void,
  ): () => void;
  onWorkspaceSearchError(
    listener: (event: WorkspaceSearchErrorEvent) => void,
  ): () => void;
  // === App-owned issues and views ===
  issueListViews(): Promise<ViewSummary[]>;
  issueListLinkedSessionIds(): Promise<string[]>;
  listSessionAttention(): Promise<SessionAttentionSnapshot[]>;
  updateSessionAttention(
    payload: UpdateSessionAttentionPayload,
  ): Promise<SessionAttentionSnapshot>;
  issueLoad(payload: LoadViewPayload): Promise<ViewFull | null>;
  /** Full markdown body for the issue detail editor. */
  issueGet(payload: GetIssuePayload): Promise<IssueRecord | null>;
  issueCreateView(payload: CreateViewPayload): Promise<ViewSummary>;
  issueDeleteView(payload: DeleteViewPayload): Promise<void>;
  issueUpdateView(payload: UpdateViewPayload): Promise<ViewFull>;
  issueCreateColumn(payload: CreateColumnPayload): Promise<ViewColumnRecord>;
  issueUpdateColumn(payload: UpdateColumnPayload): Promise<ViewColumnRecord>;
  issueMoveColumn(payload: MoveColumnPayload): Promise<ViewColumnRecord>;
  issueDeleteColumn(payload: DeleteColumnPayload): Promise<void>;
  issueCreate(payload: CreateIssuePayload): Promise<IssueRecord>;
  issueUpdate(payload: UpdateIssuePayload): Promise<IssueRecord>;
  issueMove(payload: MoveIssuePayload): Promise<IssueRecord>;
  issueDelete(payload: DeleteIssuePayload): Promise<void>;
  issueGetDetail(payload: GetIssueDetailPayload): Promise<IssueDetail | null>;
  issueCreateLabel(payload: CreateIssueLabelPayload): Promise<IssueLabel>;
  issueUpdateLabel(payload: UpdateIssueLabelPayload): Promise<IssueLabel>;
  issueDeleteLabel(payload: DeleteIssueLabelPayload): Promise<void>;
  issueAddRelation(payload: IssueRelationPayload): Promise<IssueDetail>;
  issueRemoveRelation(payload: IssueRelationPayload): Promise<IssueDetail>;
  issueComment(payload: CommentIssuePayload): Promise<IssueDetail>;
  searchDocuments(
    payload: SearchDocumentsPayload,
  ): Promise<SearchDocumentResult[]>;
  onDataChanged(
    listener: (event: CocurdexDataChangedEvent) => void,
  ): () => void;
  // Fires (debounced) when anything inside a watched workspace root changes on
  // disk, so cached file listings can be invalidated and refreshed.
  onWorkspaceFilesChanged(
    listener: (event: WorkspaceFilesChangedEvent) => void,
  ): () => void;
  // Fires (debounced) when git metadata (HEAD, index, refs) changes on disk —
  // commits, stages, or branch switches done outside the app.
  onWorkspaceGitStateChanged(
    listener: (event: WorkspaceFilesChangedEvent) => void,
  ): () => void;
  importImageAttachment(file: Blob, name: string): Promise<ImageAttachment>;
  importDocumentAttachment(
    file: Blob,
    name: string,
  ): Promise<DocumentAttachment>;
  startProviderAuthLogin(
    providerId: string,
    method: ProviderAuthMethod,
  ): Promise<{ loginId: string }>;
  nextProviderAuthLogin(loginId: string): Promise<ProviderAuthLoginUpdate>;
  respondProviderAuthLogin(
    loginId: string,
    promptId: string,
    value: string,
  ): Promise<void>;
  cancelProviderAuthLogin(loginId: string): Promise<void>;
}

/**
 * Host-only surface (Electron): OS integration the daemon contract does not
 * cover — native dialogs, BrowserView, updates, CLI install, renderer
 * logging, and daemon process management. Absent
 * on clients without a local host; gate features on
 * {@link HostApi.capabilities} instead of calling blindly.
 */
export interface HostApi {
  readonly chatWindow: ChatWindowApi;
  readonly capabilities: HostCapabilities;
  getAppUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdate(): Promise<AppUpdateState>;
  dismissAppUpdate(): Promise<AppUpdateState>;
  setAppUpdateChannel(channel: AppUpdateChannel): Promise<AppUpdateState>;
  installAppUpdate(): Promise<void>;
  onAppUpdateState(listener: (state: AppUpdateState) => void): () => void;
  getOssLicenses(): Promise<OssLicensesPayload>;
  openChromiumLicenses(): Promise<{ ok: boolean }>;
  getCliPathStatus(): Promise<CliPathStatus>;
  installCliOnPath(): Promise<CliPathStatus>;
  uninstallCliFromPath(): Promise<CliPathStatus>;
  getDaemonStatus(): Promise<DaemonRuntimeStatus>;
  restartDaemon(): Promise<DaemonRuntimeStatus>;
  getDaemonConnection(): Promise<DaemonConnectionInfo | null>;
  openWorkspace(): Promise<{
    canceled: boolean;
    filePaths: string[];
  }>;
  /** Cold-start CLI folder open; null when nothing is pending. */
  consumePendingOpenFolder(): Promise<{ rootPath: string } | null>;
  /**
   * Absolute path for a File from an OS drag-and-drop (Electron webUtils).
   * Returns null when the path cannot be resolved.
   */
  getPathForFile(file: File): string | null;
  /** Second-instance / live CLI folder open while the app is running. */
  onOpenWorkspaceFromCli(
    listener: (event: { rootPath: string }) => void,
  ): () => void;
  // Sync the renderer's resolved surface color (from --app-bg) to the native
  // window/child views so resize and startup do not flash a mismatched color.
  setWindowSurfaceColor(color: string): Promise<void>;
  browserNavigate(url: string): Promise<void>;
  browserOpenHtml(
    html: string,
    sourceId: string,
    streaming: boolean,
  ): Promise<string>;
  browserUpdateHtml(
    url: string,
    html: string,
    contentKey: string,
    streaming: boolean,
  ): Promise<boolean>;
  browserReload(): Promise<void>;
  browserStop(): Promise<void>;
  browserGoBack(): Promise<void>;
  browserGoForward(): Promise<void>;
  browserToggleAnnotationMode(enabled: boolean): Promise<void>;
  browserCaptureScreenshot(): Promise<string>;
  browserListTabs(): Promise<BrowserTabsSnapshot>;
  browserNewTab(): Promise<void>;
  browserActivateTab(id: string): Promise<void>;
  browserCloseTab(id: string): Promise<BrowserTabsSnapshot>;
  onBrowserTabs(listener: (snapshot: BrowserTabsSnapshot) => void): () => void;
  onBrowserAnnotation(
    listener: (payload: BrowserAnnotationEvent) => void,
  ): () => void;
  onBrowserAnnotationAction(
    listener: (payload: BrowserAnnotationActionEvent) => void,
  ): () => void;
  browserSetAnnotationMarkers(tabId: string, ids: string[]): Promise<void>;
  setBrowserBounds(bounds: BrowserViewBounds): Promise<void>;
  browserShow(visible: boolean): Promise<void>;
  logRendererError(payload: RendererLogPayload): Promise<void>;
  exportDiagnostics(): Promise<DiagnosticsExportResult>;
  getDiagnosticsVerbose(): Promise<boolean>;
  setDiagnosticsVerbose(enabled: boolean): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  downloadUrl(url: string): Promise<void>;
  openPresentationWindow(request: {
    channel: string;
  }): Promise<PresentationWindowResult>;
  closePresentationWindow(request: { channel: string }): Promise<void>;
}

export interface PresentationWindowResult {
  opened: boolean;
  externalDisplay: boolean;
}

export type ProductEventApi = Pick<
  ProductApi,
  | "onDataChanged"
  | "onWorkspaceFilesChanged"
  | "onWorkspaceGitStateChanged"
  | "onWorkspaceSearchResult"
  | "onWorkspaceSearchDone"
  | "onWorkspaceSearchError"
  | "onPtyData"
  | "onPtyExit"
  | "onPtyActivity"
>;

export type ProductRequestApi = Omit<ProductApi, keyof ProductEventApi>;

export type HostBridge = HostApi;

/** Desktop facade: product contract plus the Electron host surface. */
export interface DesktopApi extends ProductApi, HostApi {}

declare global {
  interface Window {
    desktopApi?: HostBridge;
  }
}
