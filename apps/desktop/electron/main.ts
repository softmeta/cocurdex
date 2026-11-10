import path from "node:path";
import { parseBackgroundLaunch } from "@cocurdex/daemon/background-launch";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  COCURDEX_USER_DATA_PATH_ENV,
  getDesktopLogDirectory,
} from "@cocurdex/daemon/paths";
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
import { createDaemonRuntimeLifecycle } from "./chat/daemon-runtime-lifecycle";
import type { DaemonRuntimeClientOptions } from "./chat/daemon-runtime-types";
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
  WINDOW_MATERIAL_ARGUMENT,
  windowMaterialFor,
  windowMaterialOptions,
} from "./window";

const MIN_WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 520;
const REMOTE_DEBUGGING_PORT_ENV = "COCURDEX_REMOTE_DEBUGGING_PORT";
const appLogger = createLogger("app");
const daemonLogger = createLogger("daemon-runtime-client");
let appQuitAllowed = false;
let appShutdownPromise: Promise<void> | null = null;
let daemonRuntimeClient: DaemonRuntimeClient | null = null;
const backgroundLaunch = parseBackgroundLaunch(process.argv);
const preloadPath = resolveElectronEntryPath(
  import.meta.url,
  "../preload/preload.cjs",
);
const rendererRootDir = resolveElectronEntryPath(
  import.meta.url,
  "../renderer",
);

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

if (backgroundLaunch?.userDataPath) {
  process.env[COCURDEX_USER_DATA_PATH_ENV] = backgroundLaunch.userDataPath;
}
app.setPath(
  "userData",
  resolveUserDataPath(app.getPath("userData"), app.isPackaged),
);

const openFolderFromLaunch = extractOpenFolderFromProcess(process.argv);
const gotTheLock =
  !backgroundLaunch &&
  app.requestSingleInstanceLock(
    openFolderFromLaunch ? { openFolder: openFolderFromLaunch } : {},
  );
if (backgroundLaunch) {
  app.dock?.hide();
} else if (!gotTheLock) {
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

applyShellEnv({
  platform: process.platform,
  env: process.env,
  resolveEnv: resolveShellEnv,
});
initializeNetworkProxyRuntime();

configureRemoteDebugging();

function requireDaemonRuntimeClient() {
  if (!daemonRuntimeClient) {
    throw new Error("Daemon runtime client is not initialized");
  }

  return daemonRuntimeClient;
}

function getSurfaceColor() {
  return nativeTheme.shouldUseDarkColors ? "#0f0f11" : "#ffffff";
}

let chatWindows: ReturnType<typeof registerChatWindowHandlers> | undefined;
const materialWindows = new WeakSet<BrowserWindow>();

function createWindow() {
  const surfaceColor = getSurfaceColor();
  const material = windowMaterialFor(
    process.platform,
    process.getSystemVersion(),
  );
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    backgroundColor: surfaceColor,
    show: false,
    ...titleBarChromeOptions(process.platform, surfaceColor),
    ...windowMaterialOptions(material),
    webPreferences: {
      preload: preloadPath,
      backgroundThrottling: false,
      devTools: resolveMainWindowDevTools({ packaged: app.isPackaged }),
      additionalArguments: material ? [WINDOW_MATERIAL_ARGUMENT] : [],
    },
  });
  if (material) materialWindows.add(window);
  chatWindows?.setPrimaryWindow(window);
  let didShowWindow = false;
  const showWindowOnce = () => {
    if (didShowWindow || window.isDestroyed()) {
      return;
    }
    didShowWindow = true;
    window.show();
  };

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

protocol.registerSchemesAsPrivileged([rendererScheme]);

function configureAppLogging(userDataPath: string) {
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
}

function appLaunchCommand() {
  if (app.isPackaged) return [process.env.APPIMAGE || process.execPath];
  return [process.execPath, app.getAppPath()];
}

function daemonRuntimeOptions(
  userDataPath: string,
): Omit<DaemonRuntimeClientOptions, "onEvent"> {
  return {
    appLaunchCommand: appLaunchCommand(),
    daemonEntryPath: getBundledDaemonEntryPath(),
    logger: daemonLogger,
    userDataPath,
    webRoot: path.join(app.getAppPath(), "out", "renderer"),
  };
}

async function launchBackgroundDaemon() {
  const userDataPath = app.getPath("userData");
  configureAppLogging(userDataPath);
  const lifecycle = createDaemonRuntimeLifecycle({
    ...daemonRuntimeOptions(userDataPath),
    detached: true,
    onEvent: () => undefined,
  });
  let exitCode = 0;
  try {
    await lifecycle.ensure();
    appLogger.info("daemon.backgroundLaunched");
  } catch (error) {
    exitCode = 1;
    appLogger.error("daemon.backgroundLaunchFailed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  await shutdownLogging().catch(() => undefined);
  app.exit(exitCode);
}

app
  .whenReady()
  .then(async () => {
    if (backgroundLaunch) {
      await launchBackgroundDaemon();
      return;
    }
    if (!gotTheLock) {
      return;
    }

    const userDataPath = app.getPath("userData");
    configureAppLogging(userDataPath);
    appLogger.info("crashReporter.ready", {
      crashDumpsDirectory: app.getPath("crashDumps"),
    });
    initializeAppState(userDataPath);
    daemonRuntimeClient = createDaemonRuntimeClient({
      ...daemonRuntimeOptions(userDataPath),
      onEvent(event) {
        if (event.type === "data.changed" && event.areas.includes("settings")) {
          loadAndApplyNetworkProxyFromDaemon().catch((error: unknown) => {
            appLogger.warn("networkProxy.applyFailed", {
              message: error instanceof Error ? error.message : String(error),
            });
          });
        }
        if (event.type === "peer.message") {
          appLogger.info("daemon.peerMessage", { ...event });
        } else if (event.type === "team.changed") {
          appLogger.info("daemon.teamChanged", { ...event });
        }
      },
    });
    const daemonReady = daemonRuntimeClient.initialize();
    setDaemonReady(daemonReady);
    daemonReady.catch((error: unknown) => {
      appLogger.error("daemon.initializeFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
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
    void ensureCliOnPathBestEffort();
    ipcMain.handle("dialog:openDirectory", async () =>
      dialog.showOpenDialog({ properties: ["openDirectory"] }),
    );
    registerHandler(
      ipcMain,
      "window:setSurfaceColor",
      schemas.hexColor,
      async (event, color) => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window && !materialWindows.has(window)) {
          window.setBackgroundColor(color);
        }
        if (window && hasTitleBarOverlay(process.platform)) {
          window.setTitleBarOverlay(titleBarOverlayFor(color));
        }
        getBrowserView()?.setBackgroundColor(color);
      },
    );
    registerHandler(
      ipcMain,
      "window:setThemeSource",
      schemas.themeSource,
      async (_event, themeSource) => {
        nativeTheme.themeSource = themeSource;
      },
    );
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
