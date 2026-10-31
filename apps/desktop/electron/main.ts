import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { getDesktopLogDirectory } from "@cocurdex/daemon/paths";
import type { BrowserAnnotation } from "@cocurdex/shared";
import { buildPolicy, hashLogValue, hostForLog } from "@cocurdex/shared";
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
  activateBrowserTab,
  attachBrowserHost,
  browserNavigationSchema,
  browserTabIdForContents,
  captureAnnotation,
  closeBrowserTab,
  getBrowserTabs,
  getBrowserView,
  navigateBrowser,
  newBrowserTab,
  registerBrowserHtmlHandlers,
  setBrowserAnnotationMarkers,
  setBrowserBounds,
  setBrowserVisible,
  toggleBrowserAnnotationMode,
} from "./browser";
import { chatDaemonOptions, initializeAppState, setDaemonReady } from "./chat";
import {
  createDaemonRuntimeClient,
  type DaemonRuntimeClient,
} from "./chat/daemon-runtime-client";
import {
  ensureCliOnPathBestEffort,
  getBundledDaemonEntryPath,
  registerCliPathHandlers,
} from "./cli-path";
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
import {
  initializeNetworkProxyRuntime,
  loadAndApplyNetworkProxyFromDaemon,
} from "./network";
import {
  consumePendingOpenFolder,
  extractOpenFolderFromAdditionalData,
  extractOpenFolderFromProcess,
  focusMainWindow,
  queueOpenFolder,
} from "./open-folder";
import { registerOssLicensesHandlers } from "./oss-licenses";
import { syncKeepAwakeFromDaemon } from "./power";
import { denyWindowNavigation, resolveMainWindowDevTools } from "./security";
import { applyShellEnv, resolveShellEnv } from "./shell-env";
import { registerAppUpdateHandlers, startAppUpdater } from "./updater";
import {
  hasTitleBarOverlay,
  migrateLegacyRendererStorage,
  registerAudienceWindowHandlers,
  registerChatWindowHandlers,
  registerRendererProtocol,
  rendererPageUrl,
  rendererScheme,
  titleBarChromeOptions,
  titleBarOverlayFor,
} from "./window";

const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 520;
const REMOTE_DEBUGGING_PORT_ENV = "COCURDEX_REMOTE_DEBUGGING_PORT";
const appLogger = createLogger("app");
const daemonLogger = createLogger("daemon-runtime-client");
let appQuitAllowed = false;
let appShutdownPromise: Promise<void> | null = null;
let daemonRuntimeClient: DaemonRuntimeClient | null = null;

function syncKeepAwake() {
  syncKeepAwakeFromDaemon().catch((error: unknown) => {
    appLogger.warn("keepAwake.syncFailed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
}
const preloadPath = resolveElectronEntryPath(
  import.meta.url,
  "../preload/preload.cjs",
);
const rendererRootDir = resolveElectronEntryPath(
  import.meta.url,
  "../renderer",
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
      variable: REMOTE_DEBUGGING_PORT_ENV,
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
            targetDirHash: hashLogValue(folder),
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
  const rootPath = await requestDaemon(
    "workspace.resolveOpenPath",
    { path: folderPath, allowFile: false },
    await chatDaemonOptions(),
  );
  if (!rootPath) {
    throw new Error("Open folder path is not a directory");
  }
  queueOpenFolder(rootPath, { broadcast: options?.broadcast });
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

function requireDaemonRuntimeClient() {
  if (!daemonRuntimeClient) {
    throw new Error("Daemon runtime client is not initialized");
  }

  return daemonRuntimeClient;
}

// Match the renderer's surface color so there is no dark flash before the
// first paint and no black gutters during async child-view resizes.
function getSurfaceColor() {
  return nativeTheme.shouldUseDarkColors ? "#0f0f11" : "#ffffff";
}

let chatWindows: ReturnType<typeof registerChatWindowHandlers> | undefined;

function createWindow() {
  const surfaceColor = getSurfaceColor();
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: surfaceColor,
    show: false,
    ...titleBarChromeOptions(process.platform, surfaceColor),
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
  chatWindows?.setPrimaryWindow(window);
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
        host: hostForLog(validatedURL),
      });
      showWindowOnce();
    },
  );

  // The renderer takes over background color via `window:setSurfaceColor`
  // once it mounts — that path knows about the user's manual theme override.
  // The initial `backgroundColor` above is just for the pre-mount frame.
  attachBrowserHost(window);

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

  void window.loadURL(rendererPageUrl());
  return window;
}

function registerBrowserHandlers() {
  registerBrowserHtmlHandlers(ipcMain);
  ipcMain.handle("browser:listTabs", () => getBrowserTabs());
  ipcMain.handle("browser:newTab", () => newBrowserTab());
  registerHandler(
    ipcMain,
    "browser:activateTab",
    z.string().uuid(),
    (_event, id) => {
      activateBrowserTab(id);
    },
  );
  registerHandler(
    ipcMain,
    "browser:closeTab",
    z.string().uuid(),
    (_event, id) => {
      return closeBrowserTab(id);
    },
  );
  registerHandler(
    ipcMain,
    "browser:navigate",
    browserNavigationSchema,
    async (_event, url) => {
      await navigateBrowser(url);
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
  const broadcast = (channel: string, payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  };

  ipcMain.on(
    "browser:annotation",
    async (event, annotation: unknown, submit: unknown) => {
      const tabId = browserTabIdForContents(event.sender.id);
      if (!tabId) return;
      const parsed = schemas.browserAnnotation.safeParse(annotation);
      if (!parsed.success) {
        appLogger.warn("browser.annotationRejected", {
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join(".")} ${issue.message}`,
          ),
        });
        return;
      }
      const validated: BrowserAnnotation = {
        ...parsed.data,
        regionScreenshot: await captureAnnotation(
          event.sender,
          parsed.data.boundingBox,
        ),
      };
      broadcast("browser:annotation", {
        tabId,
        annotation: validated,
        submit: submit === true,
      });
    },
  );

  ipcMain.on("browser:annotation:action", (event, action: unknown) => {
    const tabId = browserTabIdForContents(event.sender.id);
    const parsed = schemas.browserAnnotationAction.safeParse(action);
    if (!tabId || !parsed.success) return;
    broadcast("browser:annotation:action", { tabId, action: parsed.data });
  });

  registerHandlerArgs(
    ipcMain,
    "browser:setAnnotationMarkers",
    schemas.browserAnnotationMarkers,
    async (_event, tabId, ids) => {
      setBrowserAnnotationMarkers(tabId, ids);
    },
  );

  registerHandler(
    ipcMain,
    "browser:setBounds",
    schemas.bounds,
    async (_event, bounds) => {
      setBrowserBounds(
        {
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.w),
          height: Math.round(bounds.h),
        },
        { width: bounds.viewportWidth, height: bounds.viewportHeight },
        { x: bounds.anchorX, y: bounds.anchorY },
      );
    },
  );

  registerHandler(
    ipcMain,
    "browser:show",
    schemas.visible,
    async (_event, visible) => {
      setBrowserVisible(visible);
    },
  );
}

async function shutdownAppResources() {
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

// Privileges must be registered before app ready.
protocol.registerSchemesAsPrivileged([rendererScheme]);

app
  .whenReady()
  .then(async () => {
    if (!gotTheLock) {
      return;
    }

    const userDataPath = app.getPath("userData");
    const logsPath = getDesktopLogDirectory(userDataPath);
    configureLogging({
      appVersion: app.getVersion(),
      diagnosticsPreferencesPath: path.join(
        userDataPath,
        "diagnostics-preferences.json",
      ),
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
    daemonRuntimeClient = createDaemonRuntimeClient({
      daemonEntryPath: getBundledDaemonEntryPath(),
      webRoot: path.join(app.getAppPath(), "out", "renderer"),
      logger: daemonLogger,
      onConnected: syncKeepAwake,
      onEvent(event) {
        if (event.type === "data.changed" && event.areas.includes("settings")) {
          loadAndApplyNetworkProxyFromDaemon().catch((error: unknown) => {
            appLogger.warn("networkProxy.applyFailed", {
              message: error instanceof Error ? error.message : String(error),
            });
          });
          syncKeepAwake();
        }
        if (event.type === "peer.message") {
          appLogger.info("daemon.peerMessage", { ...event });
        } else if (event.type === "team.changed") {
          appLogger.info("daemon.teamChanged", { ...event });
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
    const proxyReady = loadAndApplyNetworkProxyFromDaemon().catch(
      (error: unknown) => {
        appLogger.warn("networkProxy.loadFailed", {
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    registerRendererProtocol(rendererRootDir);
    registerBrowserHandlers();
    registerLoggingHandlers();
    registerCliPathHandlers();
    registerAppUpdateHandlers();
    registerOssLicensesHandlers();
    chatWindows = registerChatWindowHandlers({
      preloadPath,
      createPrimaryWindow: createWindow,
    });
    registerAudienceWindowHandlers(ipcMain, { preloadPath });
    startAppUpdater({
      currentVersion: app.getVersion(),
      packaged: app.isPackaged && buildPolicy.updates,
      userDataPath,
      whenReadyToCheck: proxyReady,
      broadcast(state) {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send("app:updateState", state);
        }
      },
    }).catch((error: unknown) => {
      appLogger.error("updater.startFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    registerApplicationMenu();
    ipcMain.handle("daemon:getStatus", async () =>
      requireDaemonRuntimeClient().getStatus(),
    );
    ipcMain.handle(
      "daemon:connection",
      async () => daemonRuntimeClient?.connection() ?? null,
    );
    ipcMain.handle("daemon:restart", async () =>
      requireDaemonRuntimeClient().restart(),
    );
    // Packaged builds: best-effort symlink/shim into ~/.local/bin (or
    // %LOCALAPPDATA%\Cocurdex\bin) so `cocurdex` is on the user PATH.
    void ensureCliOnPathBestEffort();
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
        if (window && hasTitleBarOverlay(process.platform)) {
          window.setTitleBarOverlay(titleBarOverlayFor(color));
        }
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
    registerHandler(
      ipcMain,
      "shell:downloadUrl",
      schemas.loopbackUrl,
      async (event, url) => {
        event.sender.downloadURL(url);
      },
    );
    // CLI cold-start: renderer pulls the path after bootstrap so jotai stores
    // are ready. Live second-instance opens also push workspace:openFromCli.
    ipcMain.handle("workspace:consumeOpenFolder", () => {
      const rootPath = consumePendingOpenFolder();
      return rootPath ? { rootPath } : null;
    });
    await migrateLegacyRendererStorage({
      rootDir: rendererRootDir,
      userDataPath,
    }).catch((error: unknown) => {
      appLogger.error("rendererStorage.migrationFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
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
            targetDirHash: hashLogValue(initialFolder),
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

import { z } from "zod";
