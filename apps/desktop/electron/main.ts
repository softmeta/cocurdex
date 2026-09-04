import { homedir } from "node:os";
import path from "node:path";
import type {
  AgentId,
  AgentPermissionDecision,
  ArchiveSessionPayload,
  BrowserAnnotation,
  CreateSessionPayload,
  DeleteSessionPayload,
  EditorViewRecord,
  MessageRecord,
  RefineSessionTitlePayload,
  SendSessionMessagePayload,
  SubmitPreviousMessagePayload,
  UpdateSessionTitlePayload,
  WorkspaceRecord,
} from "@cocurdex/shared";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  protocol,
  shell,
} from "electron";
import { registerApplicationMenu } from "./app-menu";
import { resolveElectronEntryPath, resolveUserDataPath } from "./app-paths";
import {
  type ImportDocumentAttachmentPayload,
  type ImportImageAttachmentPayload,
  importDocumentAttachment,
  importImageAttachment,
  initializeAttachmentStorage,
  readImageAttachmentDataUrl,
} from "./attachment";
import {
  createBrowserView,
  getBrowserView,
  toggleBrowserAnnotationMode,
} from "./browser";
import {
  archiveSession,
  bootstrapAppState,
  configureChatEventBroadcast,
  deleteWorkspace,
  generateSessionTitle,
  getMessageById,
  getSession,
  getToolCallResult,
  initializeAppState,
  listAgents,
  listMessagesBySessionId,
  listToolCallsBySessionId,
  listWorkspaces,
  readAdapterRateLimits,
  registerChatHandlers,
  saveEditorView,
  saveWorkspace,
  setDaemonReady,
  updateSessionTitle,
} from "./chat";
import {
  createDaemonRuntimeClient,
  type DaemonRuntimeClient,
} from "./chat/daemon-runtime-client";
import {
  ensureCliOnPathBestEffort,
  getBundledDaemonEntryPath,
  registerCliPathHandlers,
} from "./cli-path";
import { registerDataHandlers } from "./data";
import { listSystemFontFamilies } from "./fonts/system-fonts";
import { registerHandler, registerHandlerArgs, schemas } from "./ipc";
import {
  configureLogging,
  createLogger,
  isMainDiagnosticsEnabled,
  logProcessError,
  registerLoggingHandlers,
  shutdownLogging,
  startCrashReporter,
  summarizeProcessGone,
} from "./logging";
import { registerMcpHandlers } from "./mcp";
import {
  initializeNetworkProxyRuntime,
  loadAndApplyNetworkProxyFromStorage,
  registerNetworkProxyHandlers,
} from "./network";
import {
  consumePendingOpenFolder,
  extractOpenFolderFromAdditionalData,
  extractOpenFolderFromProcess,
  focusMainWindow,
  queueOpenFolder,
  resolveDroppedOpenPath,
} from "./open-folder";
import { registerOssLicensesHandlers } from "./oss-licenses";
import {
  initializePdfAnnotationsStorage,
  loadPdfDocumentAnnotations,
  savePdfDocumentAnnotations,
} from "./pdf-annotations";
import {
  buildRuntimeProviderConfig,
  generateProviderSessionTitle,
  registerProviderHandlers,
} from "./provider";
import { getPtyService } from "./pty";
import { denyWindowNavigation, resolveMainWindowDevTools } from "./security";
import { applyShellEnv, resolveShellEnv } from "./shell-env";
import { registerSkillsHandlers } from "./skills";
import { registerAppUpdateHandlers, startAppUpdater } from "./updater";
import {
  buildPdfAssetUrl,
  checkoutGitBranch,
  closeAllWorkspaceFilesWatchers,
  closeAllWorkspacePathCommands,
  commitGitChanges,
  configureWorkspaceFilesChangedBroadcast,
  configureWorkspaceGitStateChangedBroadcast,
  createWorkspaceCheckpoint,
  discardGitFiles,
  ensureWorkspaceFilesWatcher,
  fileExists,
  generateGitCommitMessage,
  getWorkspaceCheckpointStatus,
  getWorkspaceDiff,
  getWorkspaceGitStatus,
  initializeWorkspaceCheckpoints,
  listGitBranches,
  listGitCommits,
  listWorkspaceFiles,
  pushGitBranch,
  readTextFile,
  readWorkspaceEntries,
  registerPdfProtocol,
  resolvePdfReadPath,
  restoreWorkspaceCheckpoint,
  stageGitFiles,
  unstageGitFiles,
  workspaceSearchService,
} from "./workspace";

const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 520;
const REMOTE_DEBUGGING_PORT_ENV = "COCURDEX_REMOTE_DEBUGGING_PORT";
const appLogger = createLogger("app");
const sessionLogger = createLogger("session");
const checkpointLogger = createLogger("workspace-checkpoint");
const daemonLogger = createLogger("daemon-runtime-client");
let appQuitAllowed = false;
let appShutdownPromise: Promise<void> | null = null;
let daemonRuntimeClient: DaemonRuntimeClient | null = null;
const preloadPath = resolveElectronEntryPath(
  import.meta.url,
  "../preload/preload.cjs",
);
const rendererHtmlPath = resolveElectronEntryPath(
  import.meta.url,
  "../renderer/index.html",
);

// Capture native crashes (renderer/GPU/utility/main) as on-disk minidumps.
// Must run at module load, before `app` is ready and before any window opens,
// so early and bypass-the-JS-handler crashes are still recorded.
startCrashReporter();

function configureRemoteDebugging() {
  const rawPort = process.env[REMOTE_DEBUGGING_PORT_ENV];
  if (!rawPort) {
    return;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.warn("[perf] remote debugging disabled: invalid port", {
      env: REMOTE_DEBUGGING_PORT_ENV,
      value: rawPort,
    });
    return;
  }

  app.commandLine.appendSwitch("remote-debugging-port", String(port));
  app.commandLine.appendSwitch(
    "remote-allow-origins",
    `http://127.0.0.1:${port}`,
  );
  console.info("[perf] remote debugging enabled", { port });
}

// Isolate local-dev persisted state from an installed build. Must run before
// app 'ready' so Chromium storage (IndexedDB, cookies, Local Storage) also
// lands in the dev-specific directory.
app.setPath(
  "userData",
  resolveUserDataPath(app.getPath("userData"), app.isPackaged),
);

// Single-instance after userData is settled so the lock file lives next to the
// correct profile (dev vs packaged). `cocurdex .` from a second terminal focuses
// the existing window and opens the folder there (VS Code-style).
//
// Packaged builds: second-instance argv order is unstable on some platforms —
// pass the folder via additionalData (Electron-recommended) and fall back to argv.
const openFolderFromLaunch = extractOpenFolderFromProcess(process.argv);
const gotTheLock = app.requestSingleInstanceLock(
  openFolderFromLaunch ? { openFolder: openFolderFromLaunch } : {},
);
if (!gotTheLock) {
  app.quit();
} else {
  app.on(
    "second-instance",
    (_event, argv, _workingDirectory, additionalData) => {
      const folder =
        extractOpenFolderFromAdditionalData(additionalData) ??
        extractOpenFolderFromProcess(argv);
      if (folder) {
        void handleCliOpenFolder(folder, { broadcast: true }).catch((error) => {
          appLogger.error("openFolder.secondInstanceFailed", {
            folder,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
      focusMainWindow();
    },
  );
}

async function handleCliOpenFolder(
  folderPath: string,
  options?: { broadcast?: boolean },
): Promise<void> {
  const workspaces = await listWorkspaces();
  await queueOpenFolder(folderPath, {
    broadcast: options?.broadcast,
    existingRootPaths: workspaces.map((workspace) => workspace.rootPath),
  });
}

// Restore the user's login-shell environment so packaged builds launched from
// Finder/Dock get the real PATH (agent detection / CLI spawns) plus provider
// auth and proxy vars exported from the shell profile (the managed OpenCode
// server inherits process.env directly).
applyShellEnv({
  platform: process.platform,
  env: process.env,
  resolveEnv: resolveShellEnv,
});
// Snapshot shell proxy env after merge, before any app overlay.
initializeNetworkProxyRuntime();

configureRemoteDebugging();

function createUserMessage(payload: SendSessionMessagePayload): MessageRecord {
  return {
    id: payload.messageId ?? crypto.randomUUID(),
    sessionId: payload.session.id,
    role: "user",
    content: payload.content.trim(),
    attachments: payload.attachments ?? [],
    createdAt: payload.createdAt ?? new Date().toISOString(),
  };
}

function requireDaemonRuntimeClient() {
  if (!daemonRuntimeClient) {
    throw new Error("Daemon runtime client is not initialized");
  }

  return daemonRuntimeClient;
}

async function captureWorkspaceCheckpoint(
  payload: SendSessionMessagePayload,
  userMessage: MessageRecord,
) {
  await createWorkspaceCheckpoint({
    agentType: payload.session.agentType,
    message: userMessage,
    workspaceRootPath: payload.workspaceRootPath,
  }).catch((error: unknown) => {
    checkpointLogger.warn("checkpoint.captureSkipped", {
      error: error instanceof Error ? error.message : "Unknown error",
      messageId: userMessage.id,
      sessionId: userMessage.sessionId,
    });
  });
}

async function permanentlyDeleteSession(sessionId: string) {
  await requireDaemonRuntimeClient().deleteSession(sessionId);
}

// Match the renderer's surface color so there is no dark flash before the
// first paint and no black gutters during async child-view resizes.
function getSurfaceColor() {
  return nativeTheme.shouldUseDarkColors ? "#0f0f11" : "#ffffff";
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: getSurfaceColor(),
    show: false,
    titleBarStyle: isMac ? "hidden" : undefined,
    // Keep y in sync with renderer TITLEBAR_HEIGHT (32). Real traffic-light
    // diameter is ~14px (not 12), so y = (32 - 14) / 2 = 9 for true vertical
    // center. x:12 pairs with TITLEBAR_TRAFFIC_LIGHT_RESERVE (80).
    trafficLightPosition: isMac ? { x: 12, y: 9 } : undefined,
    webPreferences: {
      preload: preloadPath,
      // Keep painting at full rate when the window is occluded/resizing so
      // child WebContentsView resizes don't reveal an unpainted layer.
      backgroundThrottling: false,
      // Disable DevTools on the main window in packaged builds (menu items,
      // keyboard shortcuts and openDevTools() all become no-ops). The in-app
      // browser view keeps its own DevTools.
      devTools: resolveMainWindowDevTools({ packaged: app.isPackaged }),
    },
  });
  let didShowWindow = false;
  const showWindowOnce = () => {
    if (didShowWindow || window.isDestroyed()) {
      return;
    }
    didShowWindow = true;
    window.show();
  };

  // Defer the first show until the renderer has produced a frame; otherwise
  // the OS would composite an empty window using `backgroundColor` first.
  window.once("ready-to-show", showWindowOnce);
  window.webContents.once("did-finish-load", showWindowOnce);
  window.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL) => {
      appLogger.error("window.loadFailed", {
        errorCode,
        errorDescription,
        url: validatedURL,
      });
      showWindowOnce();
    },
  );

  // The renderer takes over background color via `window:setSurfaceColor`
  // once it mounts — that path knows about the user's manual theme override.
  // The initial `backgroundColor` above is just for the pre-mount frame.
  const view = createBrowserView();
  view.setBackgroundColor(getSurfaceColor());
  window.contentView.addChildView(view);

  denyWindowNavigation(window.webContents);

  window.webContents.on("render-process-gone", (_event, details) => {
    const summary = summarizeProcessGone(details);
    const log = summary.fatal ? appLogger.error : appLogger.warn;
    log("renderer.processGone", {
      crashDumpsDirectory: app.getPath("crashDumps"),
      exitCode: summary.exitCode,
      fatal: summary.fatal,
      reason: summary.reason,
      url: window.webContents.getURL(),
    });
  });

  // PtyService broadcasts pty:data / pty:exit through this window's webContents.
  getPtyService().attachWindow(window);
  const webContentsId = window.webContents.id;
  window.on("closed", () => {
    workspaceSearchService.cancelForWebContents(webContentsId);
    getPtyService().dispose();
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;

  if (rendererUrl) {
    const url = new URL(rendererUrl);

    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      void window.loadURL(rendererUrl);
      return;
    }
  }

  void window.loadFile(rendererHtmlPath);
}

function registerWorkspaceHandlers() {
  ipcMain.handle("workspace:list", async () => listWorkspaces());
  registerHandler(
    ipcMain,
    "workspace:save",
    schemas.workspaceSave,
    async (_event, workspace) =>
      saveWorkspace(workspace as unknown as WorkspaceRecord),
  );
  registerHandler(
    ipcMain,
    "workspace:delete",
    schemas.workspaceId,
    async (_event, workspaceId) => deleteWorkspace(workspaceId),
  );
  // Reveals the workspace root in Finder/Explorer/Files. The directory on
  // disk is never modified — this is the read-only sibling to workspace:delete
  // which only touches the app's local DB.
  registerHandler(
    ipcMain,
    "workspace:openInFileManager",
    schemas.rootPath,
    async (_event, rootPath) => {
      const error = await shell.openPath(rootPath);
      if (error) {
        throw new Error(error);
      }
    },
  );
  // Reveals a specific file or directory in Finder/Explorer/Files, selecting
  // the item within its parent folder. Read-only sibling to openInFileManager,
  // which opens a directory directly rather than highlighting an entry.
  registerHandler(
    ipcMain,
    "workspace:revealPath",
    schemas.filePath,
    async (_event, targetPath) => {
      shell.showItemInFolder(targetPath);
    },
  );
  registerHandler(
    ipcMain,
    "workspace:listEntries",
    schemas.rootPath,
    async (_event, rootPath) => readWorkspaceEntries(rootPath),
  );
  registerHandler(
    ipcMain,
    "workspace:listFiles",
    schemas.rootPath,
    async (_event, rootPath) => {
      // Piggyback on the listing call: any root the renderer browses gets a
      // watcher so later external changes push a files-changed notification.
      await ensureWorkspaceFilesWatcher(rootPath);
      return listWorkspaceFiles(rootPath);
    },
  );
  registerHandler(
    ipcMain,
    "git:listBranches",
    schemas.rootPath,
    async (_event, rootPath) => {
      // Branch consumers also need external HEAD/refs updates even when the
      // file tree and git diff panel have not initialized this root yet.
      await ensureWorkspaceFilesWatcher(rootPath);
      return listGitBranches(rootPath);
    },
  );
  registerHandler(
    ipcMain,
    "git:checkoutBranch",
    schemas.gitBranch,
    async (_event, { rootPath, branch }) => checkoutGitBranch(rootPath, branch),
  );
  registerHandler(
    ipcMain,
    "git:listCommits",
    schemas.gitCommitsQuery,
    async (_event, { rootPath, limit }) => {
      await ensureWorkspaceFilesWatcher(rootPath);
      return listGitCommits(rootPath, { limit });
    },
  );
  registerHandler(
    ipcMain,
    "git:getWorkspaceDiff",
    schemas.gitDiffQuery,
    async (_event, { rootPath, query }) => {
      // The git panel may query a root before any file listing does; make sure
      // it gets a watcher so external edits push change notifications.
      await ensureWorkspaceFilesWatcher(rootPath);
      return getWorkspaceDiff(rootPath, query);
    },
  );
  registerHandler(
    ipcMain,
    "git:getWorkspaceStatus",
    schemas.rootPath,
    async (_event, rootPath) => {
      await ensureWorkspaceFilesWatcher(rootPath);
      return getWorkspaceGitStatus(rootPath);
    },
  );
  registerHandler(
    ipcMain,
    "git:stageFiles",
    schemas.gitFiles,
    async (_event, { rootPath, filePaths }) =>
      stageGitFiles(rootPath, filePaths),
  );
  registerHandler(
    ipcMain,
    "git:unstageFiles",
    schemas.gitFiles,
    async (_event, { rootPath, filePaths }) =>
      unstageGitFiles(rootPath, filePaths),
  );
  registerHandler(
    ipcMain,
    "git:discardFiles",
    schemas.gitFiles,
    async (_event, { rootPath, filePaths }) =>
      discardGitFiles(rootPath, filePaths),
  );
  registerHandler(
    ipcMain,
    "git:commit",
    schemas.gitCommit,
    async (_event, { rootPath, message, includeUnstaged }) =>
      commitGitChanges(rootPath, { message, includeUnstaged }),
  );
  registerHandler(
    ipcMain,
    "git:generateCommitMessage",
    schemas.gitGenerateCommitMessage,
    async (_event, { rootPath, includeUnstaged }) =>
      generateGitCommitMessage(rootPath, { includeUnstaged }),
  );
  registerHandler(
    ipcMain,
    "git:push",
    schemas.rootPath,
    async (_event, rootPath) => pushGitBranch(rootPath),
  );
  registerHandler(
    ipcMain,
    "file:readText",
    schemas.filePath,
    async (_event, filePath) => readTextFile(filePath),
  );
  registerHandler(
    ipcMain,
    "file:exists",
    schemas.filePath,
    async (_event, filePath) => fileExists(filePath),
  );
  registerHandler(
    ipcMain,
    "attachment:importDocument",
    schemas.importDocument,
    async (_event, payload) =>
      importDocumentAttachment(
        payload as unknown as ImportDocumentAttachmentPayload,
      ),
  );
  registerHandler(
    ipcMain,
    "attachment:importImage",
    schemas.importImage,
    async (_event, payload) =>
      importImageAttachment(payload as unknown as ImportImageAttachmentPayload),
  );
  registerHandler(
    ipcMain,
    "attachment:readImageDataUrl",
    schemas.filePath,
    async (_event, filePath) => readImageAttachmentDataUrl(filePath),
  );
  registerHandler(
    ipcMain,
    "pdf:read-data",
    schemas.readPdf,
    async (_event, payload) => {
      resolvePdfReadPath(payload.filePath, await listWorkspaceRootPaths());
      return buildPdfAssetUrl(payload.filePath);
    },
  );
  registerHandler(
    ipcMain,
    "pdf:load-annotations",
    schemas.loadPdfAnnotations,
    async (_event, payload) => {
      resolvePdfReadPath(payload.filePath, await listWorkspaceRootPaths());
      return loadPdfDocumentAnnotations(payload.filePath);
    },
  );
  registerHandler(
    ipcMain,
    "pdf:save-annotations",
    schemas.savePdfAnnotations,
    async (_event, payload) => {
      resolvePdfReadPath(payload.filePath, await listWorkspaceRootPaths());
      await savePdfDocumentAnnotations(payload.filePath, payload.annotations);
    },
  );
}

function registerSessionHandlers() {
  registerHandler(
    ipcMain,
    "session:listMessages",
    schemas.sessionId,
    async (_event, sessionId) => listMessagesBySessionId(sessionId),
  );
  registerHandler(
    ipcMain,
    "session:listToolCalls",
    schemas.sessionId,
    async (_event, sessionId) => listToolCallsBySessionId(sessionId),
  );
  registerHandler(
    ipcMain,
    "session:getToolCallResult",
    schemas.toolCallId,
    async (_event, toolCallId) => getToolCallResult(toolCallId),
  );
  registerHandler(
    ipcMain,
    "session:undoTurnChanges",
    schemas.undoTurnChanges,
    async (_event, payload) =>
      requireDaemonRuntimeClient().undoTurnChanges(payload),
  );
  registerHandler(
    ipcMain,
    "session:getTurnChangeFile",
    schemas.turnChangeFile,
    async (_event, payload) =>
      requireDaemonRuntimeClient().getTurnChangeFile(payload),
  );
  registerHandler(
    ipcMain,
    "session:create",
    schemas.sessionWithWorkspace,
    async (_event, raw) => {
      const payload = raw as unknown as CreateSessionPayload;
      const session = await requireDaemonRuntimeClient().createSession(payload);
      const providerSnapshot = payload.session.providerSnapshot;
      sessionLogger.info("session.created", {
        agentType: payload.session.agentType,
        modelId: providerSnapshot?.modelId ?? null,
        modelName: providerSnapshot?.modelName ?? null,
        providerId: providerSnapshot?.providerId ?? null,
        providerName: providerSnapshot?.providerName ?? null,
        reasoningEffort: providerSnapshot?.reasoningEffort ?? null,
        serviceTier: providerSnapshot?.serviceTier ?? null,
        thinkingLevel: providerSnapshot?.thinkingLevel ?? null,
        sessionId: payload.session.id,
        title: payload.session.title,
        workspaceRootPath: payload.workspaceRootPath,
      });
      return session;
    },
  );
  registerHandler(
    ipcMain,
    "session:sendMessage",
    schemas.sessionWithWorkspace,
    async (_event, raw) => {
      const payload = raw as unknown as SendSessionMessagePayload;
      const userMessage = createUserMessage(payload);
      await captureWorkspaceCheckpoint(payload, userMessage);
      const providerConfig = await buildRuntimeProviderConfig(payload.session);

      return requireDaemonRuntimeClient().sendMessage(
        {
          ...payload,
          messageId: userMessage.id,
          createdAt: userMessage.createdAt,
          content: userMessage.content,
          attachments: userMessage.attachments,
        },
        providerConfig,
      );
    },
  );
  registerHandler(
    ipcMain,
    "session:updateQueuedInput",
    schemas.queuedInputUpdate,
    async (_event, payload) =>
      requireDaemonRuntimeClient().updateQueuedInput(
        payload.sessionId,
        payload.messageId,
        payload.content,
      ),
  );
  registerHandler(
    ipcMain,
    "session:deleteQueuedInput",
    schemas.queuedInput,
    async (_event, payload) =>
      requireDaemonRuntimeClient().deleteQueuedInput(
        payload.sessionId,
        payload.messageId,
      ),
  );
  registerHandler(
    ipcMain,
    "session:steerQueuedInput",
    schemas.queuedInput,
    async (_event, payload) =>
      requireDaemonRuntimeClient().steerQueuedInput(
        payload.sessionId,
        payload.messageId,
      ),
  );
  registerHandler(
    ipcMain,
    "session:submitPreviousMessage",
    schemas.sessionPayload,
    async (_event, raw) => {
      const payload = raw as unknown as SubmitPreviousMessagePayload;
      const existingMessage = await getMessageById(payload.messageId);

      if (
        !existingMessage ||
        existingMessage.sessionId !== payload.session.id
      ) {
        throw new Error("Previous message not found");
      }

      if (existingMessage.role !== "user") {
        throw new Error("Only user messages can be resubmitted");
      }

      await requireDaemonRuntimeClient().stop(payload.session.id);

      if (payload.revertWorkspace) {
        await restoreWorkspaceCheckpoint({
          messageId: payload.messageId,
          sessionId: payload.session.id,
        });
      }

      const userMessage: MessageRecord = {
        ...existingMessage,
        content: payload.content.trim(),
        attachments: payload.attachments ?? [],
      };

      await requireDaemonRuntimeClient().rewindSession(userMessage);
      await captureWorkspaceCheckpoint(payload, userMessage);
      const providerConfig = await buildRuntimeProviderConfig(payload.session);

      return requireDaemonRuntimeClient().sendMessage(
        {
          ...payload,
          content: userMessage.content,
          attachments: userMessage.attachments,
          createdAt: userMessage.createdAt,
        },
        providerConfig,
      );
    },
  );
  registerHandlerArgs(
    ipcMain,
    "session:getPreviousMessageCheckpointStatus",
    schemas.sessionIdAndMessageId,
    async (_event, sessionId, messageId) =>
      getWorkspaceCheckpointStatus({ messageId, sessionId }),
  );
  registerHandler(
    ipcMain,
    "session:updateTitle",
    schemas.updateTitle,
    async (_event, raw) => {
      const payload = raw as unknown as UpdateSessionTitlePayload;
      sessionLogger.debug("session.titleUpdateRequested", {
        sessionId: payload.sessionId,
        expectedTitleLength: payload.expectedTitle?.length ?? null,
        titleLength: payload.title.length,
      });

      const updatedSession = await updateSessionTitle(
        payload.sessionId,
        payload.title,
        {
          expectedTitle: payload.expectedTitle,
          updatedAt: payload.updatedAt,
        },
      );

      sessionLogger.debug("session.titleUpdateCompleted", {
        sessionId: payload.sessionId,
        returnedTitleLength: updatedSession?.title.length ?? null,
        updated: updatedSession?.title === payload.title,
      });

      return updatedSession;
    },
  );
  registerHandler(
    ipcMain,
    "session:archive",
    schemas.archive,
    async (_event, raw) => {
      const payload = raw as unknown as ArchiveSessionPayload;
      await requireDaemonRuntimeClient().stop(payload.sessionId);
      return archiveSession(payload.sessionId, payload.archivedAt);
    },
  );
  registerHandler(
    ipcMain,
    "session:delete",
    schemas.delete,
    async (_event, raw) => {
      const payload = raw as unknown as DeleteSessionPayload;
      return permanentlyDeleteSession(payload.sessionId);
    },
  );
  registerHandler(
    ipcMain,
    "session:refineTitle",
    schemas.refineTitle,
    async (_event, raw) => {
      const payload = raw as unknown as RefineSessionTitlePayload;
      sessionLogger.debug("session.titleRefinementReceived", {
        sessionId: payload.sessionId,
        expectedTitleLength: payload.expectedTitle.length,
        fallbackTitleLength: payload.fallbackTitle.length,
        messageLength: payload.message.length,
      });

      const currentSession = await getSession(payload.sessionId);

      if (!currentSession || currentSession.title !== payload.expectedTitle) {
        sessionLogger.debug("session.titleRefinementSkipped", {
          sessionId: payload.sessionId,
          currentTitleLength: currentSession?.title.length ?? null,
          expectedTitleLength: payload.expectedTitle.length,
          reason: currentSession ? "title-mismatch" : "missing-session",
        });

        return currentSession;
      }

      let title: string | null = null;
      if (currentSession.agentType === "claude-agent") {
        try {
          title = await generateSessionTitle(
            payload.sessionId,
            payload.message,
          );
        } catch (error) {
          sessionLogger.info("session.titleRefinementGenerationFailed", {
            error: error instanceof Error ? error.message : String(error),
            sessionId: payload.sessionId,
          });
        }
      } else {
        title = await generateProviderSessionTitle(currentSession, payload);
      }

      if (!title || title === payload.expectedTitle) {
        sessionLogger.debug("session.titleRefinementKeptCurrent", {
          sessionId: payload.sessionId,
          expectedTitleLength: payload.expectedTitle.length,
          generatedTitleLength: title?.length ?? null,
        });

        return currentSession;
      }

      sessionLogger.debug("session.titleRefinementUpdatingTitle", {
        sessionId: payload.sessionId,
        expectedTitleLength: payload.expectedTitle.length,
        generatedTitleLength: title.length,
      });

      return updateSessionTitle(payload.sessionId, title, {
        expectedTitle: payload.expectedTitle,
      });
    },
  );
  registerHandler(
    ipcMain,
    "editorView:save",
    schemas.editorView,
    async (_event, view) => saveEditorView(view as unknown as EditorViewRecord),
  );
  registerHandler(
    ipcMain,
    "session:stop",
    schemas.sessionId,
    async (_event, sessionId) => {
      await requireDaemonRuntimeClient().stop(sessionId);
    },
  );
  registerHandler(
    ipcMain,
    "session:listSlashCommands",
    schemas.slashCommands,
    async (_event, payload) => {
      // Always logged (not gated behind diagnostics): the renderer swallows a
      // failure here into an empty menu, so this file log is the only way to
      // tell "agent has no commands" from "listing threw" on a user machine.
      try {
        const commands = await requireDaemonRuntimeClient().listSlashCommands(
          payload.agentType as AgentId,
          payload.workspaceRootPath,
        );
        sessionLogger.info("session.slashCommandsListed", {
          agentType: payload.agentType,
          count: commands.length,
          workspaceRootPath: payload.workspaceRootPath,
        });
        return commands;
      } catch (error) {
        sessionLogger.error("session.slashCommandsFailed", {
          agentType: payload.agentType,
          message: error instanceof Error ? error.message : String(error),
          workspaceRootPath: payload.workspaceRootPath,
        });
        throw error;
      }
    },
  );
  registerHandler(
    ipcMain,
    "session:setRuntimeMode",
    schemas.sessionRuntimeMode,
    async (_event, payload) =>
      requireDaemonRuntimeClient().setMode(payload.sessionId, payload.modeId),
  );
  registerHandler(
    ipcMain,
    "session:setRuntimeConfig",
    schemas.sessionRuntimeConfig,
    async (_event, payload) =>
      requireDaemonRuntimeClient().setConfig(
        payload.sessionId,
        payload.configId,
        payload.value,
      ),
  );
  registerHandlerArgs(
    ipcMain,
    "permission:resolve",
    schemas.permissionResolve,
    async (_event, requestId, decision) => {
      await requireDaemonRuntimeClient().resolvePermission(
        requestId,
        decision as AgentPermissionDecision,
      );
    },
  );
  registerHandlerArgs(
    ipcMain,
    "question:resolve",
    schemas.questionResolve,
    async (_event, questionId, answer) => {
      await requireDaemonRuntimeClient().resolveQuestion(questionId, answer);
    },
  );
  registerHandlerArgs(
    ipcMain,
    "planApproval:resolve",
    schemas.planApprovalResolve,
    async (_event, approvalId, decision) => {
      await requireDaemonRuntimeClient().resolvePlanApproval(approvalId, {
        outcome: decision.outcome,
        feedback: decision.feedback ?? null,
      });
    },
  );
}

function registerBrowserHandlers() {
  registerHandler(
    ipcMain,
    "browser:navigate",
    schemas.url,
    async (_event, url) => {
      const view = createBrowserView();
      await view.webContents.loadURL(url);
    },
  );

  ipcMain.handle("browser:reload", async () => {
    getBrowserView()?.webContents.reload();
  });

  ipcMain.handle("browser:stop", async () => {
    getBrowserView()?.webContents.stop();
  });

  ipcMain.handle("browser:goBack", async () => {
    getBrowserView()?.webContents.navigationHistory.goBack();
  });

  ipcMain.handle("browser:goForward", async () => {
    getBrowserView()?.webContents.navigationHistory.goForward();
  });

  registerHandler(
    ipcMain,
    "browser:toggleAnnotationMode",
    schemas.enabled,
    async (_event, enabled) => {
      await toggleBrowserAnnotationMode(enabled);
    },
  );

  ipcMain.handle("browser:captureScreenshot", async () => {
    const view = getBrowserView();
    if (!view) {
      return "";
    }

    const image = await view.webContents.capturePage();
    return image.toDataURL();
  });

  // Annotations come from arbitrary web pages via the browser view's preload
  // bridge — validate before rebroadcasting to the trusted main renderer.
  ipcMain.on("browser:annotation", (_event, annotation: unknown) => {
    const parsed = schemas.browserAnnotation.safeParse(annotation);
    if (!parsed.success) {
      appLogger.warn("browser.annotationRejected", {
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join(".")} ${issue.message}`,
        ),
      });
      return;
    }
    const validated: BrowserAnnotation = parsed.data;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send("browser:annotation", validated);
    }
  });

  registerHandler(
    ipcMain,
    "browser:setBounds",
    schemas.bounds,
    async (_event, bounds) => {
      const view = getBrowserView();
      if (!view) {
        return;
      }

      view.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.w),
        height: Math.round(bounds.h),
      });
    },
  );

  registerHandler(
    ipcMain,
    "browser:show",
    schemas.visible,
    async (_event, visible) => {
      getBrowserView()?.setVisible(visible);
    },
  );
}

// PTY spawn accepts a cwd path from the renderer. Tighten that boundary so a
// compromised renderer can't drop the user into a shell rooted at /private,
// `~/.ssh`, or anywhere outside: (1) a project the user has opened, or
// (2) the user home directory (no-workspace / chat-only terminal).
async function assertCwdIsAllowedTerminalRoot(cwd: string): Promise<void> {
  const workspaces = await listWorkspaces();
  const normalized = path.normalize(cwd);
  const home = path.normalize(homedir());
  const allowed =
    normalized === home ||
    workspaces.some((workspace) => {
      const root = path.normalize(workspace.rootPath);
      return normalized === root;
    });
  if (!allowed) {
    throw new Error(
      "pty:spawn rejected: cwd is not a registered workspace root or home directory",
    );
  }
}

// Authorization source for PDF reads: the roots the user has actually opened,
// straight from main-process state. Never derived from renderer input.
async function listWorkspaceRootPaths(): Promise<string[]> {
  const workspaces = await listWorkspaces();
  return workspaces.map((workspace) => workspace.rootPath);
}

async function assertRootIsKnownWorkspace(rootPath: string): Promise<void> {
  const workspaces = await listWorkspaces();
  const normalized = path.normalize(rootPath);
  const allowed = workspaces.some((workspace) => {
    const root = path.normalize(workspace.rootPath);
    return normalized === root;
  });
  if (!allowed) {
    throw new Error(
      "search:start rejected: rootPath is not a registered workspace root",
    );
  }
}

function registerSearchHandlers() {
  registerHandler(
    ipcMain,
    "search:start",
    schemas.searchStart,
    async (event, payload) => {
      await assertRootIsKnownWorkspace(payload.rootPath);
      workspaceSearchService.start(payload, event.sender);
    },
  );
  registerHandler(
    ipcMain,
    "search:cancel",
    schemas.searchCancel,
    async (_event, payload) => {
      workspaceSearchService.cancel(payload.searchId);
    },
  );
}

function registerPtyHandlers() {
  registerHandler(
    ipcMain,
    "pty:spawn",
    schemas.ptySpawn,
    async (_event, payload) => {
      await assertCwdIsAllowedTerminalRoot(payload.cwd);
      return getPtyService().spawn(payload);
    },
  );
  registerHandler(
    ipcMain,
    "pty:write",
    schemas.ptyWrite,
    async (_event, payload) => {
      getPtyService().write(payload.terminalId, payload.data);
    },
  );
  registerHandler(
    ipcMain,
    "pty:resize",
    schemas.ptyResize,
    async (_event, payload) => {
      getPtyService().resize(payload.terminalId, payload.cols, payload.rows);
    },
  );
  registerHandler(
    ipcMain,
    "pty:kill",
    schemas.ptyKill,
    async (_event, payload) => {
      getPtyService().kill(payload.terminalId);
    },
  );
}

async function shutdownAppResources() {
  try {
    workspaceSearchService.dispose();
  } catch (error) {
    appLogger.error("app.searchShutdownFailed", { error });
  }
  try {
    await getPtyService().dispose();
  } catch (error) {
    appLogger.error("app.ptyShutdownFailed", { error });
  }
  try {
    closeAllWorkspacePathCommands();
  } catch (error) {
    appLogger.error("app.workspaceCommandShutdownFailed", { error });
  }
  try {
    closeAllWorkspaceFilesWatchers();
  } catch (error) {
    appLogger.error("app.workspaceWatcherShutdownFailed", { error });
  }

  const runtimeClient = daemonRuntimeClient;
  daemonRuntimeClient = null;
  try {
    await runtimeClient?.dispose();
  } catch (error) {
    appLogger.error("app.daemonShutdownFailed", { error });
  }

  try {
    await shutdownLogging();
  } catch (error) {
    console.error("Failed to shut down application logging", error);
  }
}

function beginAppShutdown() {
  if (!appShutdownPromise) {
    appShutdownPromise = shutdownAppResources().finally(() => {
      appQuitAllowed = true;
      app.quit();
    });
  }
  return appShutdownPromise;
}

app.on("before-quit", (event) => {
  if (appQuitAllowed) {
    return;
  }
  event.preventDefault();
  void beginAppShutdown();
});

app.on("child-process-gone", (_event, details) => {
  const summary = summarizeProcessGone(details);
  const log = summary.fatal ? appLogger.error : appLogger.warn;
  log("app.childProcessGone", {
    crashDumpsDirectory: app.getPath("crashDumps"),
    exitCode: summary.exitCode,
    fatal: summary.fatal,
    name: details.name,
    reason: summary.reason,
    serviceName: details.serviceName,
    type: details.type,
  });
});

process.on("uncaughtException", (error) => {
  logProcessError("process.uncaughtException", error);
  app.quit();
});

process.on("unhandledRejection", (reason) => {
  logProcessError("process.unhandledRejection", reason);
  app.quit();
});

// Privileges must be registered before app ready. Electron 43 / Chromium 150
// rejects XHR/fetch from the vite origin (http://localhost:5173) to custom
// schemes unless the scheme is secure + fetch + CORS enabled; missing flags
// surface as "Cross origin requests are only supported for protocol schemes:
// chrome, chrome-extension, …, http, https" and every PDF fails to open.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "pdf-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

app
  .whenReady()
  .then(async () => {
    if (!gotTheLock) {
      return;
    }

    const userDataPath = app.getPath("userData");
    const logsPath = app.getPath("logs");
    configureLogging({
      appVersion: app.getVersion(),
      diagnosticsDirectory: path.join(userDataPath, "diagnostics"),
      logDirectory: logsPath,
      sessionLogDirectory: path.join(logsPath, "sessions"),
      pretty: !app.isPackaged,
      verbose: !app.isPackaged || isMainDiagnosticsEnabled(),
    });
    // Surface where native minidumps land so crash investigations can find them.
    appLogger.info("crashReporter.ready", {
      crashDumpsDirectory: app.getPath("crashDumps"),
    });
    initializeAppState(userDataPath);
    initializeAttachmentStorage(userDataPath);
    initializePdfAnnotationsStorage(userDataPath);
    initializeWorkspaceCheckpoints(userDataPath);
    daemonRuntimeClient = createDaemonRuntimeClient({
      daemonEntryPath: getBundledDaemonEntryPath(),
      logger: daemonLogger,
      onEvent(event) {
        for (const window of BrowserWindow.getAllWindows()) {
          if (event.type === "data.changed") {
            window.webContents.send("data:changed", event);
          } else {
            window.webContents.send("agent:event", event);
          }
        }
      },
      userDataPath,
    });
    // Spawning the daemon and loading the renderer are independent, so start
    // the daemon and keep going: the window appears while it boots. Everything
    // that talks to the daemon waits on this promise instead (setDaemonReady).
    const daemonReady = daemonRuntimeClient.initialize();
    setDaemonReady(daemonReady);
    daemonReady.catch((error: unknown) => {
      appLogger.error("daemon.initializeFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    // Needs app_settings storage, so it trails the daemon: apply the app proxy
    // to main process.env + Chromium session (daemon applied its own on boot).
    // Nothing paints before this lands — the renderer's first outbound request
    // is user-triggered, long after startup.
    const proxyReady = loadAndApplyNetworkProxyFromStorage().catch(
      (error: unknown) => {
        appLogger.warn("networkProxy.loadFailed", {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    configureChatEventBroadcast((event) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("chat:event", event);
      }
    });
    configureWorkspaceFilesChangedBroadcast((rootPath) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:filesChanged", { rootPath });
      }
    });
    configureWorkspaceGitStateChangedBroadcast((rootPath) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.webContents.send("workspace:gitStateChanged", { rootPath });
      }
    });
    registerPdfProtocol(listWorkspaceRootPaths);
    registerWorkspaceHandlers();
    registerSessionHandlers();
    registerProviderHandlers();
    registerNetworkProxyHandlers();
    registerMcpHandlers();
    registerBrowserHandlers();
    registerSearchHandlers();
    registerPtyHandlers();
    registerLoggingHandlers();
    registerChatHandlers(ipcMain);
    registerDataHandlers(ipcMain, userDataPath);
    registerCliPathHandlers();
    registerSkillsHandlers();
    registerAppUpdateHandlers();
    registerOssLicensesHandlers();
    startAppUpdater({
      currentVersion: app.getVersion(),
      packaged: app.isPackaged,
      whenReadyToCheck: proxyReady,
      broadcast(state) {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("app:updateState", state);
        }
      },
    });
    registerApplicationMenu();
    ipcMain.handle("daemon:getStatus", async () =>
      requireDaemonRuntimeClient().getStatus(),
    );
    ipcMain.handle("daemon:restart", async () =>
      requireDaemonRuntimeClient().restart(),
    );
    // Packaged builds: best-effort symlink/shim into ~/.local/bin (or
    // %LOCALAPPDATA%\Cocurdex\bin) so `cocurdex` is on the user PATH.
    void ensureCliOnPathBestEffort();
    ipcMain.handle("app:bootstrap", async () => {
      const state = await bootstrapAppState();
      const resumedSessionIds = new Set<string>();
      const queuedSessionIds = new Set(
        state.queuedAgentInputs.map((input) => input.sessionId),
      );
      for (const sessionId of queuedSessionIds) {
        const session = state.sessions.find((item) => item.id === sessionId);
        if (!session) continue;
        try {
          const providerConfig = await buildRuntimeProviderConfig(session);
          const resumed =
            await requireDaemonRuntimeClient().resumeQueuedSession(
              sessionId,
              providerConfig,
            );
          if (resumed) resumedSessionIds.add(sessionId);
        } catch (error) {
          sessionLogger.error("session.queueResumeFailed", {
            error: error instanceof Error ? error.message : String(error),
            sessionId,
          });
        }
      }
      if (resumedSessionIds.size === 0) return state;

      // resumeQueuedSession starts the first durable follow-up before this IPC
      // reply reaches the renderer. Return a fresh snapshot so that message is
      // already in the transcript and only the remaining inputs hydrate the
      // queue shelf, even if the renderer was not yet subscribed to events.
      const resumedState = await bootstrapAppState();
      for (const session of resumedState.sessions) {
        if (resumedSessionIds.has(session.id)) session.status = "running";
      }
      return resumedState;
    });
    ipcMain.handle("app:getHomeDir", () => homedir());
    // Installed font families for Appearance pickers (cached in system-fonts).
    ipcMain.handle("app:listFontFamilies", () => listSystemFontFamilies());
    ipcMain.handle("agent:list", async () => listAgents());
    ipcMain.handle(
      "agent:readRateLimits",
      async (_event, agentIds: AgentId[]) =>
        readAdapterRateLimits(Array.isArray(agentIds) ? agentIds : []),
    );
    ipcMain.handle("dialog:openDirectory", async () =>
      dialog.showOpenDialog({ properties: ["openDirectory"] }),
    );
    // Renderer owns the resolved theme (it includes the user's manual override
    // on top of system prefersDark), so it pushes the surface color back here.
    // We mirror it onto the native BrowserWindow + child WebContentsView so
    // resize/startup compositing matches what React will paint.
    registerHandler(
      ipcMain,
      "window:setSurfaceColor",
      schemas.hexColor,
      async (event, color) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.setBackgroundColor(color);
        getBrowserView()?.setBackgroundColor(color);
      },
    );
    // Renderer-driven external link opening — used by terminal links so users
    // hit their real browser instead of having Electron load the URL inside
    // BrowserWindow / BrowserView.
    registerHandler(
      ipcMain,
      "shell:openExternal",
      schemas.url,
      async (_event, url) => {
        await shell.openExternal(url);
      },
    );
    // CLI cold-start: renderer pulls the path after bootstrap so jotai stores
    // are ready. Live second-instance opens also push workspace:openFromCli.
    ipcMain.handle("workspace:consumeOpenFolder", () => {
      const rootPath = consumePendingOpenFolder();
      return rootPath ? { rootPath } : null;
    });
    // OS drag-and-drop: renderer has a File path via webUtils; main validates
    // directory (or parent of a file) and remaps onto an existing workspace root.
    registerHandler(
      ipcMain,
      "workspace:resolveOpenPath",
      schemas.rootPath,
      async (_event, folderPath) => {
        const workspaces = await listWorkspaces();
        const rootPath = await resolveDroppedOpenPath(
          folderPath,
          workspaces.map((workspace) => workspace.rootPath),
        );
        return rootPath ? { rootPath } : null;
      },
    );

    createWindow();

    const initialFolder =
      openFolderFromLaunch ?? extractOpenFolderFromProcess(process.argv);
    if (initialFolder) {
      // Do not broadcast: renderer consumes after bootstrap so selection is not
      // overwritten by bootstrapWorkspaces. WorkspacePicker + sidebar both read
      // activeWorkspaceId after consumePendingOpenFolder.
      void handleCliOpenFolder(initialFolder, { broadcast: false }).catch(
        (error) => {
          appLogger.error("openFolder.initialFailed", {
            folder: initialFolder,
            message: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }
  })
  .catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Unknown desktop startup error";
    appLogger.error("app.startupFailed", { message });
    dialog.showErrorBox("Cocurdex failed to start", message);
    app.quit();
  });
