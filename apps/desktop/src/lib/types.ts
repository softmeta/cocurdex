import type {
  AgentDescriptor,
  AgentEvent,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentProviderSelection,
  AgentRateLimitsReadResult,
  AgentSessionConfigOption,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentToolCallResult,
  AppBootstrapData,
  ArchiveSessionPayload,
  BrowserAnnotation,
  ChatEvent,
  CocurdexDataChangedEvent,
  CommitMessageModelSelection,
  CompatibleProviderModel,
  ConversationMessageRecord,
  ConversationRecord,
  CreateColumnPayload,
  CreateConversationPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateSessionPayload,
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
  ImageAttachment,
  IssueRecord,
  LoadViewPayload,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxySettings,
  NetworkProxyTestResult,
  NoteRecord,
  NoteSummary,
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
  SearchDocumentResult,
  SearchDocumentsPayload,
  SendConversationMessagePayload,
  SendSessionMessagePayload,
  SessionMessagesResult,
  SessionRecord,
  SubmitPreviousMessagePayload,
  TitleModelProbeResult,
  TitleModelSelection,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
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
  WorkspaceRecord,
} from "@cocurdex/shared";

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: WorkspaceEntry[];
}

export interface WorkspaceFileEntry {
  kind: "directory" | "file";
  name: string;
  path: string;
  relativePath: string;
}

export interface WorkspaceFilesChangedEvent {
  rootPath: string;
  changedPaths?: string[];
}

// local: refs/heads; remote: origin/main style; detached: short HEAD hash.
export type GitRefKind = "local" | "remote" | "detached";

export interface GitBranchInfo {
  name: string;
  current: boolean;
  kind: GitRefKind;
}

// One commit for the git panel's "commit" scope picker.
export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  // ISO-8601 timestamp from git `%cI`.
  committedAt: string;
}

// Diff source mode for the git panel. "working" is the historical default
// (index + worktree vs HEAD, including untracked).
export type GitDiffScopeMode =
  | "working"
  | "unstaged"
  | "staged"
  | "commit"
  | "branch";

// Query payload for getWorkspaceGitDiff. Omitted query means `{ mode: "working" }`.
export type WorkspaceGitDiffQuery =
  | { mode: "working" }
  | { mode: "unstaged" }
  | { mode: "staged" }
  | { mode: "commit"; commit: string }
  // source (left) vs target (right): changes on source relative to target
  // (`git diff target...source`).
  | { mode: "branch"; source: string; target: string };

// Whether a changed file's modifications are in the index, the working tree, or
// split across both (staged a revision, then edited further).
export type GitFileStagedState = "staged" | "unstaged" | "partial";

// Kind of change relative to HEAD. Renames are disabled in the diff commands,
// so a rename always surfaces as a delete + add pair.
export type GitChangeKind = "added" | "modified" | "deleted";

// Why a change carries no textual contents: git flagged it binary, or the file
// exceeds the size cap for building an in-memory diff.
export type GitContentsOmittedReason = "binary" | "too-large";

// A single changed file relative to HEAD, carrying full old/new contents so the
// renderer can build a non-partial diff and expand unchanged context on demand.
export interface WorkspaceGitFileChange {
  // Path relative to the workspace root, used for display and collapse identity.
  path: string;
  changeType: GitChangeKind;
  // HEAD version of the file; empty string for newly added files.
  oldContents: string;
  // Working-tree version of the file; empty string for deleted files.
  newContents: string;
  // Non-null when contents were withheld; the renderer shows a placeholder row.
  omittedReason: GitContentsOmittedReason | null;
  // Index vs working-tree staging status, driving the row's stage checkbox.
  stagedState: GitFileStagedState;
}

// Outcome of a workspace diff request, so the renderer can distinguish "clean
// tree" from "not a git repository" and "git failed" instead of showing all
// three as an empty change list.
export type WorkspaceGitDiffStatus = "ok" | "not-a-repo" | "error";

export interface WorkspaceGitDiffResult {
  status: WorkspaceGitDiffStatus;
  changes: WorkspaceGitFileChange[];
}

// Built-in git badge kinds for the explorer file tree (`@pierre/trees`
// `GitStatus`). Matches the library's status set so renderer mapping is 1:1.
export type WorkspaceGitTreeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked"
  | "ignored";

export interface WorkspaceGitStatusEntry {
  // Path relative to the workspace root (same identity as file-tree paths).
  path: string;
  status: WorkspaceGitTreeStatus;
}

// Outcome of a lightweight status request (no file contents). Same status
// enum as the full diff so empty-state handling can stay parallel.
export interface WorkspaceGitStatusResult {
  status: WorkspaceGitDiffStatus;
  entries: WorkspaceGitStatusEntry[];
}

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

export interface WorkspaceSearchStartPayload {
  searchId: string;
  rootPath: string;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  maxResults: number;
  // Comma-separated glob patterns. Empty string means no filter.
  include: string;
  exclude: string;
}

export interface WorkspaceSearchMatchRange {
  startColumn: number;
  endColumn: number;
}

export interface WorkspaceSearchMatch {
  filePath: string;
  line: number;
  text: string;
  ranges: WorkspaceSearchMatchRange[];
}

export interface WorkspaceSearchResultEvent {
  searchId: string;
  batch: WorkspaceSearchMatch[];
}

export interface WorkspaceSearchDoneEvent {
  searchId: string;
  reason: "completed" | "cancelled" | "empty-query" | "limit-reached";
}

export interface WorkspaceSearchErrorEvent {
  searchId: string;
  message: string;
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

export type ProductSkillScope = "project" | "global";

/** Install status for the bundled cocurdex-* agent skill pack. */
export interface ProductSkillsStatus {
  scope: ProductSkillScope;
  packVersion: string;
  installed: boolean;
  managed: boolean;
  installedVersion: string | null;
  updateAvailable: boolean;
  conflict: boolean;
  conflictSkills: string[];
  skills: string[];
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  claudeLinkMode: "symlink" | "copy" | "none";
  workspaceRoot: string | null;
  sourceAvailable: boolean;
  sourceRoot: string;
}

export interface ProductSkillsInstallResult extends ProductSkillsStatus {
  action: "installed" | "updated" | "skipped" | "conflict";
}

export interface ProductSkillsRemoveResult {
  scope: ProductSkillScope;
  removed: boolean;
  agentsSkillsDir: string;
  claudeSkillsDir: string;
  removedSkills: string[];
}

// Mirrors PdfDocumentAnnotations in the PDF reader feature. Kept structural at
// the IPC boundary so main/renderer contracts do not import React feature UI.
export interface PdfDocumentAnnotationsDto {
  bookmarks: Array<{
    id: string;
    pageNumber: number;
    label?: string;
    scrollYRatio?: number;
    createdAt: number;
  }>;
  highlights: Array<{
    id: string;
    pageNumber: number;
    color: "yellow" | "green" | "blue" | "pink";
    selectedText: string;
    quads: Array<{ x1: number; y1: number; x2: number; y2: number }>;
    createdAt: number;
  }>;
}

export interface DesktopApi {
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
  readAdapterRateLimits(
    agentIds: AgentId[],
  ): Promise<Partial<Record<AgentId, AgentRateLimitsReadResult>>>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  saveWorkspace(workspace: WorkspaceRecord): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  openWorkspaceInFileManager(rootPath: string): Promise<void>;
  // Reveal a specific file or directory in the OS file manager, highlighting it
  // within its parent folder (vs. openWorkspaceInFileManager which opens a dir).
  revealPathInFileManager(targetPath: string): Promise<void>;
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
  createSession(payload: CreateSessionPayload): Promise<SessionRecord>;
  updateSessionTitle(
    payload: UpdateSessionTitlePayload,
  ): Promise<SessionRecord | null>;
  archiveSession(payload: ArchiveSessionPayload): Promise<SessionRecord | null>;
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
  sendMessage(payload: SendSessionMessagePayload): Promise<MessageRecord>;
  updateQueuedInput(
    payload: UpdateQueuedAgentInputPayload,
  ): Promise<MessageRecord>;
  deleteQueuedInput(payload: QueuedAgentInputActionPayload): Promise<void>;
  steerQueuedInput(
    payload: QueuedAgentInputActionPayload,
  ): Promise<MessageRecord>;
  submitPreviousMessage(
    payload: SubmitPreviousMessagePayload,
  ): Promise<MessageRecord>;
  getPreviousMessageCheckpointStatus(
    sessionId: string,
    messageId: string,
  ): Promise<{ available: boolean }>;
  saveEditorView(view: EditorViewRecord): Promise<void>;
  stopSession(sessionId: string): Promise<void>;
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
  resolvePermission(
    requestId: string,
    decision: AgentPermissionDecision,
  ): Promise<void>;
  resolveQuestion(questionId: string, answer: string): Promise<void>;
  resolvePlanApproval(
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ): Promise<void>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
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
  browserReload(): Promise<void>;
  browserStop(): Promise<void>;
  browserGoBack(): Promise<void>;
  browserGoForward(): Promise<void>;
  browserToggleAnnotationMode(enabled: boolean): Promise<void>;
  browserCaptureScreenshot(): Promise<string>;
  onBrowserAnnotation(
    listener: (annotation: BrowserAnnotation) => void,
  ): () => void;
  onBrowserLoading(listener: (loading: boolean) => void): () => void;
  onBrowserTitle(listener: (title: string) => void): () => void;
  onBrowserNavigated(listener: (url: string) => void): () => void;
  onBrowserError(
    listener: (error: { url: string; message: string }) => void,
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
  chatGet(conversationId: string): Promise<{
    conversation: ConversationRecord;
    messages: ConversationMessageRecord[];
  } | null>;
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
