import type {
  AgentDescriptor,
  AgentId,
  AgentProviderSelection,
  AgentRateLimitsReadResult,
  AgentRoleRecord,
  AgentSessionConfigOption,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  ArchiveSessionPayload,
  BrowserAnnotation,
  BrowserTabsSnapshot,
  ChatEvent,
  CocurdexDataChangedEvent,
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
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteSessionPayload,
  DeleteViewPayload,
  DiagnosticsExportResult,
  DocumentAttachment,
  EditConversationMessagePayload,
  EditorViewRecord,
  GetIssuePayload,
  GetNotePayload,
  GitBranchInfo,
  GitCommitInfo,
  GitWorktreeInfo,
  HostDirectoryListing,
  ImageAttachment,
  IssueRecord,
  LoadViewPayload,
  ManagedWorktree,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxySettings,
  NetworkProxyTestResult,
  NoteRecord,
  NoteSummary,
  PdfDocumentAnnotations,
  ProductSkillScope,
  ProductSkillsInstallResult,
  ProductSkillsRemoveResult,
  ProductSkillsStatusResult,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthState,
  ProviderConfigRecord,
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
  RenameNotePayload,
  RendererLogPayload,
  RetryConversationMessagePayload,
  SaveAgentRolePayload,
  SaveWorkflowDefinitionPayload,
  SearchDocumentResult,
  SearchDocumentsPayload,
  SendConversationMessagePayload,
  SessionMessagesResult,
  SessionRecord,
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
  UpdateQueuedAgentInputPayload,
  UpdateSessionTitlePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
  WorkflowDefinitionRecord,
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

export type WorkspaceFileEntry = WorkspaceFileRecord;
export type ProductSkillsStatus = ProductSkillsStatusResult;
export type PdfDocumentAnnotationsDto = PdfDocumentAnnotations;
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

export interface ImportImageAttachmentPayload {
  dataUrl: string;
  height: number;
  mimeType: string;
  name: string;
  sizeBytes: number;
  width: number;
}

export interface ImportDocumentAttachmentPayload {
  dataUrl: string;
  mimeType: "application/pdf";
  name: string;
  sizeBytes: number;
}

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

export type AppUpdateStatus =
  | "checking"
  | "downloading"
  | "error"
  | "idle"
  | "ready"
  | "unsupported";

export interface AppUpdateState {
  availableVersion: string | null;
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
}

export interface DesktopApi {
  readonly capabilities: HostCapabilities;
  bootstrapApp(): Promise<AppBootstrapData>;
  /** Absolute user home directory (default terminal cwd without a workspace). */
  getHomeDir(): Promise<string>;
  /**
   * Installed font family names from the OS (for Appearance font pickers).
   * Empty array when enumeration fails — renderer uses a curated fallback list.
   */
  listFontFamilies(): Promise<string[]>;
  getAppUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdate(): Promise<AppUpdateState>;
  dismissAppUpdate(): Promise<AppUpdateState>;
  installAppUpdate(): Promise<void>;
  onAppUpdateState(listener: (state: AppUpdateState) => void): () => void;
  getOssLicenses(): Promise<OssLicensesPayload>;
  openChromiumLicenses(): Promise<{ ok: boolean }>;
  getCliPathStatus(): Promise<CliPathStatus>;
  installCliOnPath(): Promise<CliPathStatus>;
  uninstallCliFromPath(): Promise<CliPathStatus>;
  getDaemonStatus(): Promise<DaemonRuntimeStatus>;
  restartDaemon(): Promise<DaemonRuntimeStatus>;
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
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  saveWorkspace(workspace: WorkspaceRecord): Promise<WorkspaceRecord>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  openWorkspaceInFileManager(rootPath: string): Promise<void>;
  // Reveal a specific file or directory in the OS file manager, highlighting it
  // within its parent folder (vs. openWorkspaceInFileManager which opens a dir).
  revealPathInFileManager(targetPath: string): Promise<void>;
  /**
   * List directories on the daemon host (for picking a workspace root when no
   * native directory dialog is available). Paths are daemon-host absolute.
   */
  listHostDirectories(path?: string): Promise<HostDirectoryListing>;
  listWorkspaceEntries(rootPath: string): Promise<WorkspaceEntry[]>;
  listWorkspaceFiles(rootPath: string): Promise<WorkspaceFileEntry[]>;
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
  listGitBranches(rootPath: string): Promise<GitBranchInfo[]>;
  checkoutGitBranch(rootPath: string, branch: string): Promise<void>;
  listGitWorktrees(rootPath: string): Promise<GitWorktreeInfo[]>;
  addGitWorktree(payload: {
    repoRootPath: string;
    workspaceId: string;
    branch: string;
    startPoint?: string;
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
  getWorktreeEnvironment(
    workspaceId: string,
  ): Promise<WorkspaceWorktreeEnvironment>;
  saveWorktreeEnvironment(payload: {
    workspaceId: string;
    setupScript: string;
    cleanupScript: string;
  }): Promise<WorkspaceWorktreeEnvironment>;
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
  importImageAttachment(
    payload: ImportImageAttachmentPayload,
  ): Promise<ImageAttachment>;
  importDocumentAttachment(
    payload: ImportDocumentAttachmentPayload,
  ): Promise<DocumentAttachment>;
  readImageAttachmentDataUrl(filePath: string): Promise<string>;
  readPdfData(payload: { filePath: string }): Promise<string>;
  // Per-document bookmarks + highlights in app private storage (userData).
  loadPdfAnnotations(payload: {
    filePath: string;
  }): Promise<PdfDocumentAnnotationsDto>;
  savePdfAnnotations(payload: {
    filePath: string;
    annotations: PdfDocumentAnnotationsDto;
  }): Promise<void>;
  updateSessionTitle(
    payload: UpdateSessionTitlePayload,
  ): Promise<SessionRecord | null>;
  archiveSession(payload: ArchiveSessionPayload): Promise<SessionRecord | null>;
  listArchivedSessions(): Promise<SessionRecord[]>;
  restoreSession(payload: { sessionId: string }): Promise<SessionRecord[]>;
  deleteSession(payload: DeleteSessionPayload): Promise<void>;
  refineSessionTitle(
    payload: RefineSessionTitlePayload,
  ): Promise<SessionRecord | null>;
  listProviderConfigs(): Promise<ProviderConfigRecord[]>;
  listProviderTemplates(): Promise<ProviderTemplateRecord[]>;
  readMcpConfig(): Promise<{ content: string; path: string }>;
  saveMcpConfig(content: string): Promise<{ content: string; path: string }>;
  saveProviderConfig(
    config: ProviderConfigRecord,
  ): Promise<ProviderConfigRecord>;
  deleteProviderConfig(providerId: string): Promise<void>;
  setProviderApiKey(providerId: string, apiKey: string): Promise<void>;
  clearProviderApiKey(providerId: string): Promise<void>;
  readProviderAuth(providerId: string): Promise<ProviderAuthState>;
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
  logoutProviderAuth(providerId: string): Promise<void>;
  listProviderModels(providerId: string): Promise<ProviderListModelsResult>;
  listAllProviderModels(): Promise<ProviderModelRecord[]>;
  saveProviderModel(model: ProviderModelRecord): Promise<ProviderModelRecord>;
  deleteProviderModel(providerId: string, modelId: string): Promise<void>;
  listCompatibleProvidersForAgent(
    agentId: AgentId,
    options?: { forceRefresh?: boolean },
  ): Promise<CompatibleProviderModel[]>;
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
  getNetworkProxySettings(): Promise<NetworkProxySettings>;
  setNetworkProxySettings(
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings>;
  testNetworkProxy(
    settings: NetworkProxySettings,
  ): Promise<NetworkProxyTestResult>;
  testCurrentNetworkProxy(): Promise<NetworkProxyTestResult>;
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
  /**
   * Validate a local path as a workspace root (directory, or parent of a file).
   * Returns null when the path is missing or unusable.
   */
  resolveWorkspaceOpenPath(
    filePath: string,
  ): Promise<{ rootPath: string } | null>;
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
  browserActivateTab(id: string): Promise<void>;
  browserCloseTab(id: string): Promise<BrowserTabsSnapshot>;
  onBrowserTabs(listener: (snapshot: BrowserTabsSnapshot) => void): () => void;
  onBrowserAnnotation(
    listener: (payload: {
      tabId: string;
      annotation: BrowserAnnotation;
    }) => void,
  ): () => void;
  setBrowserBounds(bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): Promise<void>;
  browserShow(visible: boolean): Promise<void>;
  logRendererError(payload: RendererLogPayload): Promise<void>;
  exportDiagnostics(): Promise<DiagnosticsExportResult>;
  openExternal(url: string): Promise<void>;
  ptySpawn(payload: PtySpawnPayload): Promise<PtySpawnResult>;
  ptyWrite(terminalId: string, data: string): Promise<void>;
  ptyResize(terminalId: string, cols: number, rows: number): Promise<void>;
  ptyKill(terminalId: string): Promise<void>;
  onPtyData(listener: (event: PtyDataEvent) => void): () => void;
  onPtyExit(listener: (event: PtyExitEvent) => void): () => void;
  onPtyActivity(listener: (event: PtyActivityEvent) => void): () => void;
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
  // === Pure chat (ChatGPT-style) ===
  chatList(): Promise<ConversationRecord[]>;
  chatGet(conversationId: string): Promise<ConversationSnapshot | null>;
  chatCreate(payload: CreateConversationPayload): Promise<ConversationRecord>;
  chatUpdate(
    payload: UpdateConversationPayload,
  ): Promise<ConversationRecord | null>;
  chatArchive(conversationId: string): Promise<ConversationRecord | null>;
  chatDelete(conversationId: string): Promise<void>;
  chatSendMessage(
    payload: SendConversationMessagePayload,
  ): Promise<ConversationMessageRecord>;
  chatRetryMessage(payload: RetryConversationMessagePayload): Promise<null>;
  chatEditMessage(
    payload: EditConversationMessagePayload,
  ): Promise<ConversationMessageRecord>;
  chatStopStream(conversationId: string): Promise<void>;
  onChatEvent(listener: (event: ChatEvent) => void): () => void;
  onChatInvalidated(listener: () => void): () => void;
  // === App-owned notes ===
  notesList(): Promise<NoteSummary[]>;
  notesGet(payload: GetNotePayload): Promise<NoteRecord | null>;
  notesCreate(payload: CreateNotePayload): Promise<NoteRecord>;
  notesUpdate(payload: UpdateNotePayload): Promise<NoteRecord>;
  notesRename(payload: RenameNotePayload): Promise<NoteRecord>;
  notesMove(payload: MoveNotePayload): Promise<NoteRecord>;
  notesDelete(payload: DeleteNotePayload): Promise<void>;
  // === App-owned issues and views ===
  issueListViews(): Promise<ViewSummary[]>;
  issueLoad(payload: LoadViewPayload): Promise<ViewFull | null>;
  /** Full markdown body for the issue detail editor. */
  issueGet(payload: GetIssuePayload): Promise<IssueRecord>;
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
  searchDocuments(
    payload: SearchDocumentsPayload,
  ): Promise<SearchDocumentResult[]>;
  onDataChanged(
    listener: (event: CocurdexDataChangedEvent) => void,
  ): () => void;
}

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}
