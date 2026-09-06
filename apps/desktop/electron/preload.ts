import type {
  AgentEvent,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentProviderSelection,
  ArchiveSessionPayload,
  ChatEvent,
  CocurdexDataChangedEvent,
  CompatibleProviderModel,
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
  EditConversationMessagePayload,
  GetIssuePayload,
  LoadViewPayload,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxySettings,
  NetworkProxyTestResult,
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthState,
  ProviderConfigRecord,
  ProviderListModelsResult,
  ProviderModelRecord,
  PtyActivityEvent,
  PtyDataEvent,
  PtyExitEvent,
  PtySpawnPayload,
  PtySpawnResult,
  QueuedAgentInputActionPayload,
  RefineSessionTitlePayload,
  RendererLogPayload,
  RetryConversationMessagePayload,
  SearchDocumentsPayload,
  SendConversationMessagePayload,
  SendSessionMessagePayload,
  SubmitPreviousMessagePayload,
  TitleModelProbeResult,
  TitleModelSelection,
  UpdateColumnPayload,
  UpdateConversationPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateQueuedAgentInputPayload,
  UpdateSessionTitlePayload,
  UpdateViewPayload,
} from "@cocurdex/shared";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  AppUpdateState,
  WorkspaceSearchDoneEvent,
  WorkspaceSearchErrorEvent,
  WorkspaceSearchResultEvent,
  WorkspaceSearchStartPayload,
} from "../src/lib/types";

contextBridge.exposeInMainWorld("desktopApi", {
  bootstrapApp: () => ipcRenderer.invoke("app:bootstrap"),
  // Sandboxed preload cannot import node:os — resolve home in main.
  // Default terminal cwd when no project workspace is open.
  getHomeDir: () => ipcRenderer.invoke("app:getHomeDir") as Promise<string>,
  listFontFamilies: () =>
    ipcRenderer.invoke("app:listFontFamilies") as Promise<string[]>,
  getAppUpdateState: () => ipcRenderer.invoke("app:update:getState"),
  checkForAppUpdate: () => ipcRenderer.invoke("app:update:check"),
  dismissAppUpdate: () => ipcRenderer.invoke("app:update:dismiss"),
  installAppUpdate: () => ipcRenderer.invoke("app:update:install"),
  getOssLicenses: () => ipcRenderer.invoke("app:getOssLicenses"),
  openChromiumLicenses: () => ipcRenderer.invoke("app:openChromiumLicenses"),
  onAppUpdateState: (listener: (state: AppUpdateState) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: AppUpdateState,
    ) => {
      listener(payload);
    };
    ipcRenderer.on("app:updateState", handler);
    return () => {
      ipcRenderer.removeListener("app:updateState", handler);
    };
  },
  listAgents: () => ipcRenderer.invoke("agent:list"),
  readAdapterRateLimits: (agentIds: AgentId[]) =>
    ipcRenderer.invoke("agent:readRateLimits", agentIds),
  listWorkspaces: () => ipcRenderer.invoke("workspace:list"),
  saveWorkspace: (workspace: import("@cocurdex/shared").WorkspaceRecord) =>
    ipcRenderer.invoke("workspace:save", workspace),
  deleteWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke("workspace:delete", workspaceId),
  openWorkspaceInFileManager: (rootPath: string) =>
    ipcRenderer.invoke("workspace:openInFileManager", rootPath),
  revealPathInFileManager: (targetPath: string) =>
    ipcRenderer.invoke("workspace:revealPath", targetPath),
  listWorkspaceEntries: (rootPath: string) =>
    ipcRenderer.invoke("workspace:listEntries", rootPath),
  listWorkspaceFiles: (rootPath: string) =>
    ipcRenderer.invoke("workspace:listFiles", rootPath),
  onWorkspaceFilesChanged: (
    listener: (event: { rootPath: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { rootPath: string },
    ) => {
      listener(payload);
    };

    ipcRenderer.on("workspace:filesChanged", handler);
    return () => {
      ipcRenderer.removeListener("workspace:filesChanged", handler);
    };
  },
  onWorkspaceGitStateChanged: (
    listener: (event: { rootPath: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { rootPath: string },
    ) => {
      listener(payload);
    };

    ipcRenderer.on("workspace:gitStateChanged", handler);
    return () => {
      ipcRenderer.removeListener("workspace:gitStateChanged", handler);
    };
  },
  onDataChanged: (listener: (event: CocurdexDataChangedEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: CocurdexDataChangedEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("data:changed", handler);
    return () => {
      ipcRenderer.removeListener("data:changed", handler);
    };
  },
  listGitBranches: (rootPath: string) =>
    ipcRenderer.invoke("git:listBranches", rootPath),
  checkoutGitBranch: (rootPath: string, branch: string) =>
    ipcRenderer.invoke("git:checkoutBranch", { rootPath, branch }),
  listGitCommits: (rootPath: string, options?: { limit?: number }) =>
    ipcRenderer.invoke("git:listCommits", {
      rootPath,
      limit: options?.limit,
    }),
  getWorkspaceGitDiff: (
    rootPath: string,
    query?: import("../src/lib/types").WorkspaceGitDiffQuery,
  ) => ipcRenderer.invoke("git:getWorkspaceDiff", { rootPath, query }),
  getWorkspaceGitStatus: (rootPath: string) =>
    ipcRenderer.invoke("git:getWorkspaceStatus", rootPath),
  stageGitFiles: (rootPath: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:stageFiles", { rootPath, filePaths }),
  unstageGitFiles: (rootPath: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:unstageFiles", { rootPath, filePaths }),
  discardGitFiles: (rootPath: string, filePaths: string[]) =>
    ipcRenderer.invoke("git:discardFiles", { rootPath, filePaths }),
  commitGitChanges: (
    rootPath: string,
    options: { message: string; includeUnstaged: boolean },
  ) =>
    ipcRenderer.invoke("git:commit", {
      rootPath,
      message: options.message,
      includeUnstaged: options.includeUnstaged,
    }),
  generateGitCommitMessage: (
    rootPath: string,
    options: { includeUnstaged: boolean },
  ) =>
    ipcRenderer.invoke("git:generateCommitMessage", {
      rootPath,
      includeUnstaged: options.includeUnstaged,
    }),
  pushGitBranch: (rootPath: string) => ipcRenderer.invoke("git:push", rootPath),
  readTextFile: (filePath: string) =>
    ipcRenderer.invoke("file:readText", filePath),
  fileExists: (filePath: string) => ipcRenderer.invoke("file:exists", filePath),
  importDocumentAttachment: (
    payload: import("../src/lib/types").ImportDocumentAttachmentPayload,
  ) => ipcRenderer.invoke("attachment:importDocument", payload),
  importImageAttachment: (
    payload: import("../src/lib/types").ImportImageAttachmentPayload,
  ) => ipcRenderer.invoke("attachment:importImage", payload),
  readImageAttachmentDataUrl: (filePath: string) =>
    ipcRenderer.invoke("attachment:readImageDataUrl", filePath),
  readPdfData: (payload: { filePath: string }) =>
    ipcRenderer.invoke("pdf:read-data", payload) as Promise<string>,
  loadPdfAnnotations: (payload: { filePath: string }) =>
    ipcRenderer.invoke("pdf:load-annotations", payload),
  savePdfAnnotations: (payload: {
    filePath: string;
    annotations: import("../src/lib/types").PdfDocumentAnnotationsDto;
  }) => ipcRenderer.invoke("pdf:save-annotations", payload),
  createSession: (payload: CreateSessionPayload) =>
    ipcRenderer.invoke("session:create", payload),
  updateSessionTitle: (payload: UpdateSessionTitlePayload) =>
    ipcRenderer.invoke("session:updateTitle", payload),
  archiveSession: (payload: ArchiveSessionPayload) =>
    ipcRenderer.invoke("session:archive", payload),
  listArchivedSessions: () => ipcRenderer.invoke("session:listArchived"),
  restoreSession: (payload: { sessionId: string }) =>
    ipcRenderer.invoke("session:restore", payload),
  deleteSession: (payload: DeleteSessionPayload) =>
    ipcRenderer.invoke("session:delete", payload),
  refineSessionTitle: (payload: RefineSessionTitlePayload) =>
    ipcRenderer.invoke("session:refineTitle", payload),
  listProviderConfigs: () => ipcRenderer.invoke("provider:listConfigs"),
  listProviderTemplates: () => ipcRenderer.invoke("provider:listTemplates"),
  readMcpConfig: () => ipcRenderer.invoke("mcp:readConfig"),
  saveMcpConfig: (content: string) =>
    ipcRenderer.invoke("mcp:saveConfig", content),
  saveProviderConfig: (config: ProviderConfigRecord) =>
    ipcRenderer.invoke("provider:saveConfig", config),
  deleteProviderConfig: (providerId: string) =>
    ipcRenderer.invoke("provider:deleteConfig", providerId),
  setProviderApiKey: (providerId: string, apiKey: string) =>
    ipcRenderer.invoke("provider:setApiKey", providerId, apiKey),
  clearProviderApiKey: (providerId: string) =>
    ipcRenderer.invoke("provider:clearApiKey", providerId),
  readProviderAuth: (providerId: string): Promise<ProviderAuthState> =>
    ipcRenderer.invoke("provider:authRead", providerId),
  startProviderAuthLogin: (
    providerId: string,
    method: ProviderAuthMethod,
  ): Promise<{ loginId: string }> =>
    ipcRenderer.invoke("provider:authLoginStart", providerId, method),
  nextProviderAuthLogin: (loginId: string): Promise<ProviderAuthLoginUpdate> =>
    ipcRenderer.invoke("provider:authLoginNext", loginId),
  respondProviderAuthLogin: (
    loginId: string,
    promptId: string,
    value: string,
  ) =>
    ipcRenderer.invoke("provider:authLoginRespond", loginId, promptId, value),
  cancelProviderAuthLogin: (loginId: string) =>
    ipcRenderer.invoke("provider:authLoginCancel", loginId),
  logoutProviderAuth: (providerId: string) =>
    ipcRenderer.invoke("provider:authLogout", providerId),
  listProviderModels: (providerId: string): Promise<ProviderListModelsResult> =>
    ipcRenderer.invoke("provider:listModels", providerId),
  listAllProviderModels: () => ipcRenderer.invoke("provider:listAllModels"),
  getCommitMessageModel: () =>
    ipcRenderer.invoke("provider:getCommitMessageModel"),
  setCommitMessageModel: (
    selection: import("@cocurdex/shared").CommitMessageModelSelection | null,
  ) => ipcRenderer.invoke("provider:setCommitMessageModel", selection),
  saveProviderModel: (model: ProviderModelRecord) =>
    ipcRenderer.invoke("provider:saveModel", model),
  deleteProviderModel: (providerId: string, modelId: string) =>
    ipcRenderer.invoke("provider:deleteModel", providerId, modelId),
  listCompatibleProvidersForAgent: (
    agentId: AgentId,
    options?: { forceRefresh?: boolean },
  ): Promise<CompatibleProviderModel[]> =>
    ipcRenderer.invoke("provider:listCompatibleForAgent", agentId, options),
  listAgentProviderDefaults: (): Promise<AgentProviderSelection[]> =>
    ipcRenderer.invoke("provider:listDefaults"),
  getAgentProviderDefault: (agentId: AgentId) =>
    ipcRenderer.invoke("provider:getDefault", agentId),
  setAgentProviderDefault: (
    agentId: AgentId,
    providerId: string,
    modelId: string,
  ) => ipcRenderer.invoke("provider:setDefault", agentId, providerId, modelId),
  getTitleModel: (): Promise<TitleModelSelection | null> =>
    ipcRenderer.invoke("provider:getTitleModel"),
  setTitleModel: (selection: TitleModelSelection | null) =>
    ipcRenderer.invoke("provider:setTitleModel", selection),
  probeTitleModel: (
    selection: TitleModelSelection,
  ): Promise<TitleModelProbeResult> =>
    ipcRenderer.invoke("provider:probeTitleModel", selection),
  getNetworkProxySettings: (): Promise<NetworkProxySettings> =>
    ipcRenderer.invoke("network:getProxySettings"),
  setNetworkProxySettings: (
    settings: NetworkProxySettings,
  ): Promise<NetworkProxySettings> =>
    ipcRenderer.invoke("network:setProxySettings", settings),
  testNetworkProxy: (
    settings: NetworkProxySettings,
  ): Promise<NetworkProxyTestResult> =>
    ipcRenderer.invoke("network:testProxy", settings),
  testCurrentNetworkProxy: (): Promise<NetworkProxyTestResult> =>
    ipcRenderer.invoke("network:testCurrentProxy"),
  listSessionMessages: (sessionId: string) =>
    ipcRenderer.invoke("session:listMessages", sessionId),
  listSessionToolCalls: (sessionId: string) =>
    ipcRenderer.invoke("session:listToolCalls", sessionId),
  getToolCallResult: (toolCallId: string) =>
    ipcRenderer.invoke("session:getToolCallResult", toolCallId),
  undoTurnChanges: (payload: import("@cocurdex/shared").UndoTurnChangesInput) =>
    ipcRenderer.invoke("session:undoTurnChanges", payload),
  getTurnChangeFile: (
    payload: import("@cocurdex/shared").TurnChangeFileContentRequest,
  ) => ipcRenderer.invoke("session:getTurnChangeFile", payload),
  sendMessage: (payload: SendSessionMessagePayload) =>
    ipcRenderer.invoke("session:sendMessage", payload),
  updateQueuedInput: (payload: UpdateQueuedAgentInputPayload) =>
    ipcRenderer.invoke("session:updateQueuedInput", payload),
  deleteQueuedInput: (payload: QueuedAgentInputActionPayload) =>
    ipcRenderer.invoke("session:deleteQueuedInput", payload),
  steerQueuedInput: (payload: QueuedAgentInputActionPayload) =>
    ipcRenderer.invoke("session:steerQueuedInput", payload),
  submitPreviousMessage: (payload: SubmitPreviousMessagePayload) =>
    ipcRenderer.invoke("session:submitPreviousMessage", payload),
  getPreviousMessageCheckpointStatus: (sessionId: string, messageId: string) =>
    ipcRenderer.invoke(
      "session:getPreviousMessageCheckpointStatus",
      sessionId,
      messageId,
    ),
  saveEditorView: (view: import("@cocurdex/shared").EditorViewRecord) =>
    ipcRenderer.invoke("editorView:save", view),
  stopSession: (sessionId: string) =>
    ipcRenderer.invoke("session:stop", sessionId),
  listSlashCommands: (agentType: AgentId, workspaceRootPath: string) =>
    ipcRenderer.invoke("session:listSlashCommands", {
      agentType,
      workspaceRootPath,
    }),
  setSessionRuntimeMode: (sessionId: string, modeId: string) =>
    ipcRenderer.invoke("session:setRuntimeMode", { sessionId, modeId }),
  setSessionRuntimeConfig: (
    sessionId: string,
    configId: string,
    value: boolean | string,
  ) =>
    ipcRenderer.invoke("session:setRuntimeConfig", {
      sessionId,
      configId,
      value,
    }),
  resolvePermission: (requestId: string, decision: AgentPermissionDecision) =>
    ipcRenderer.invoke("permission:resolve", requestId, decision),
  resolveQuestion: (questionId: string, answer: string) =>
    ipcRenderer.invoke("question:resolve", questionId, answer),
  resolvePlanApproval: (
    approvalId: string,
    decision: AgentPlanApprovalDecision,
  ) => ipcRenderer.invoke("planApproval:resolve", approvalId, decision),
  onAgentEvent: (listener: (event: AgentEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: AgentEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("agent:event", handler);
    return () => {
      ipcRenderer.removeListener("agent:event", handler);
    };
  },
  openWorkspace: () => ipcRenderer.invoke("dialog:openDirectory"),
  consumePendingOpenFolder: () =>
    ipcRenderer.invoke("workspace:consumeOpenFolder") as Promise<{
      rootPath: string;
    } | null>,
  // Electron no longer exposes File.path on the renderer File object; resolve
  // local drag-and-drop paths through webUtils in the preload bridge.
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
  resolveWorkspaceOpenPath: (filePath: string) =>
    ipcRenderer.invoke("workspace:resolveOpenPath", filePath) as Promise<{
      rootPath: string;
    } | null>,
  onOpenWorkspaceFromCli: (listener: (event: { rootPath: string }) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { rootPath: string },
    ) => {
      listener(payload);
    };

    ipcRenderer.on("workspace:openFromCli", handler);
    return () => {
      ipcRenderer.removeListener("workspace:openFromCli", handler);
    };
  },
  setWindowSurfaceColor: (color: string) =>
    ipcRenderer.invoke("window:setSurfaceColor", color),
  browserNavigate: (url: string) => ipcRenderer.invoke("browser:navigate", url),
  browserReload: () => ipcRenderer.invoke("browser:reload"),
  browserStop: () => ipcRenderer.invoke("browser:stop"),
  browserGoBack: () => ipcRenderer.invoke("browser:goBack"),
  browserGoForward: () => ipcRenderer.invoke("browser:goForward"),
  browserToggleAnnotationMode: (enabled: boolean) =>
    ipcRenderer.invoke("browser:toggleAnnotationMode", enabled),
  browserCaptureScreenshot: () =>
    ipcRenderer.invoke("browser:captureScreenshot"),
  onBrowserAnnotation: (
    listener: (
      annotation: import("@cocurdex/shared").BrowserAnnotation,
    ) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: import("@cocurdex/shared").BrowserAnnotation,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("browser:annotation", handler);
    return () => {
      ipcRenderer.removeListener("browser:annotation", handler);
    };
  },
  onBrowserLoading: (listener: (loading: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: boolean) => {
      listener(payload);
    };

    ipcRenderer.on("browser:loading", handler);
    return () => {
      ipcRenderer.removeListener("browser:loading", handler);
    };
  },
  onBrowserTitle: (listener: (title: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: string) => {
      listener(payload);
    };

    ipcRenderer.on("browser:title", handler);
    return () => {
      ipcRenderer.removeListener("browser:title", handler);
    };
  },
  onBrowserNavigated: (listener: (url: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: string) => {
      listener(payload);
    };

    ipcRenderer.on("browser:navigated", handler);
    return () => {
      ipcRenderer.removeListener("browser:navigated", handler);
    };
  },
  onBrowserError: (
    listener: (error: { url: string; message: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { url: string; message: string },
    ) => {
      listener(payload);
    };

    ipcRenderer.on("browser:error", handler);
    return () => {
      ipcRenderer.removeListener("browser:error", handler);
    };
  },
  setBrowserBounds: (bounds: { x: number; y: number; w: number; h: number }) =>
    ipcRenderer.invoke("browser:setBounds", bounds),
  browserShow: (visible: boolean) =>
    ipcRenderer.invoke("browser:show", visible),
  logRendererError: (payload: RendererLogPayload) =>
    ipcRenderer.invoke("log:rendererError", payload),
  exportDiagnostics: () => ipcRenderer.invoke("diagnostics:export"),
  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),
  ptySpawn: (payload: PtySpawnPayload): Promise<PtySpawnResult> =>
    ipcRenderer.invoke("pty:spawn", payload),
  ptyWrite: (terminalId: string, data: string) =>
    ipcRenderer.invoke("pty:write", { terminalId, data }),
  ptyResize: (terminalId: string, cols: number, rows: number) =>
    ipcRenderer.invoke("pty:resize", { terminalId, cols, rows }),
  ptyKill: (terminalId: string) =>
    ipcRenderer.invoke("pty:kill", { terminalId }),
  startWorkspaceSearch: (payload: WorkspaceSearchStartPayload) =>
    ipcRenderer.invoke("search:start", payload),
  cancelWorkspaceSearch: (searchId: string) =>
    ipcRenderer.invoke("search:cancel", { searchId }),
  // === Pure chat (ChatGPT-style) ===
  chatList: () => ipcRenderer.invoke("chat:list"),
  chatGet: (conversationId: string) =>
    ipcRenderer.invoke("chat:get", { conversationId }),
  chatCreate: (payload: CreateConversationPayload) =>
    ipcRenderer.invoke("chat:create", payload),
  chatUpdate: (payload: UpdateConversationPayload) =>
    ipcRenderer.invoke("chat:update", payload),
  chatArchive: (conversationId: string) =>
    ipcRenderer.invoke("chat:archive", { conversationId }),
  chatDelete: (conversationId: string) =>
    ipcRenderer.invoke("chat:delete", { conversationId }),
  chatSendMessage: (payload: SendConversationMessagePayload) =>
    ipcRenderer.invoke("chat:sendMessage", payload),
  chatRetryMessage: (payload: RetryConversationMessagePayload) =>
    ipcRenderer.invoke("chat:retryMessage", payload),
  chatEditMessage: (payload: EditConversationMessagePayload) =>
    ipcRenderer.invoke("chat:editMessage", payload),
  chatStopStream: (conversationId: string) =>
    ipcRenderer.invoke("chat:stopStream", { conversationId }),
  // === App-owned notes ===
  notesList: () => ipcRenderer.invoke("notes:list"),
  notesGet: (payload: { id: string }) =>
    ipcRenderer.invoke("notes:get", payload),
  notesCreate: (payload: CreateNotePayload) =>
    ipcRenderer.invoke("notes:create", payload),
  notesUpdate: (payload: UpdateNotePayload) =>
    ipcRenderer.invoke("notes:update", payload),
  notesRename: (payload: {
    id: string;
    title: string;
    expectedRevision?: number;
  }) => ipcRenderer.invoke("notes:rename", payload),
  notesMove: (payload: MoveNotePayload) =>
    ipcRenderer.invoke("notes:move", payload),
  notesDelete: (payload: DeleteNotePayload) =>
    ipcRenderer.invoke("notes:delete", payload),
  // === App-owned issues and views ===
  issueListViews: () => ipcRenderer.invoke("issue:listViews"),
  issueLoad: (payload: LoadViewPayload) =>
    ipcRenderer.invoke("issue:load", payload),
  issueGet: (payload: GetIssuePayload) =>
    ipcRenderer.invoke("issue:get", payload),
  issueCreateView: (payload: CreateViewPayload) =>
    ipcRenderer.invoke("issue:createView", payload),
  issueDeleteView: (payload: DeleteViewPayload) =>
    ipcRenderer.invoke("issue:deleteView", payload),
  issueUpdateView: (payload: UpdateViewPayload) =>
    ipcRenderer.invoke("issue:updateView", payload),
  issueCreateColumn: (payload: CreateColumnPayload) =>
    ipcRenderer.invoke("issue:createColumn", payload),
  issueUpdateColumn: (payload: UpdateColumnPayload) =>
    ipcRenderer.invoke("issue:updateColumn", payload),
  issueMoveColumn: (payload: MoveColumnPayload) =>
    ipcRenderer.invoke("issue:moveColumn", payload),
  issueDeleteColumn: (payload: DeleteColumnPayload) =>
    ipcRenderer.invoke("issue:deleteColumn", payload),
  issueCreate: (payload: CreateIssuePayload) =>
    ipcRenderer.invoke("issue:create", payload),
  issueUpdate: (payload: UpdateIssuePayload) =>
    ipcRenderer.invoke("issue:update", payload),
  issueMove: (payload: MoveIssuePayload) =>
    ipcRenderer.invoke("issue:move", payload),
  issueDelete: (payload: DeleteIssuePayload) =>
    ipcRenderer.invoke("issue:delete", payload),
  searchDocuments: (payload: SearchDocumentsPayload) =>
    ipcRenderer.invoke("search:documents", payload),
  onChatInvalidated: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("chat:invalidated", handler);
    return () => ipcRenderer.removeListener("chat:invalidated", handler);
  },
  onChatEvent: (listener: (event: ChatEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ChatEvent) => {
      listener(payload);
    };

    ipcRenderer.on("chat:event", handler);
    return () => {
      ipcRenderer.removeListener("chat:event", handler);
    };
  },
  onPtyData: (listener: (event: PtyDataEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: PtyDataEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("pty:data", handler);
    return () => {
      ipcRenderer.removeListener("pty:data", handler);
    };
  },
  onPtyExit: (listener: (event: PtyExitEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: PtyExitEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("pty:exit", handler);
    return () => {
      ipcRenderer.removeListener("pty:exit", handler);
    };
  },
  onPtyActivity: (listener: (event: PtyActivityEvent) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: PtyActivityEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("pty:activity", handler);
    return () => {
      ipcRenderer.removeListener("pty:activity", handler);
    };
  },
  onWorkspaceSearchResult: (
    listener: (event: WorkspaceSearchResultEvent) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: WorkspaceSearchResultEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("search:result", handler);
    return () => {
      ipcRenderer.removeListener("search:result", handler);
    };
  },
  onWorkspaceSearchDone: (
    listener: (event: WorkspaceSearchDoneEvent) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: WorkspaceSearchDoneEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("search:done", handler);
    return () => {
      ipcRenderer.removeListener("search:done", handler);
    };
  },
  onWorkspaceSearchError: (
    listener: (event: WorkspaceSearchErrorEvent) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: WorkspaceSearchErrorEvent,
    ) => {
      listener(payload);
    };

    ipcRenderer.on("search:error", handler);
    return () => {
      ipcRenderer.removeListener("search:error", handler);
    };
  },
  getCliPathStatus: () => ipcRenderer.invoke("cli:getPathStatus"),
  installCliOnPath: () => ipcRenderer.invoke("cli:installOnPath"),
  uninstallCliFromPath: () => ipcRenderer.invoke("cli:uninstallFromPath"),
  getDaemonStatus: () => ipcRenderer.invoke("daemon:getStatus"),
  restartDaemon: () => ipcRenderer.invoke("daemon:restart"),
  getProductSkillsStatus: (
    scope: "project" | "global",
    workspaceRootPath?: string | null,
  ) =>
    ipcRenderer.invoke("skills:getStatus", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
  installProductSkills: (
    scope: "project" | "global",
    workspaceRootPath?: string | null,
  ) =>
    ipcRenderer.invoke("skills:install", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
  removeProductSkills: (
    scope: "project" | "global",
    workspaceRootPath?: string | null,
  ) =>
    ipcRenderer.invoke("skills:remove", {
      scope,
      workspaceRootPath: workspaceRootPath ?? null,
    }),
});
