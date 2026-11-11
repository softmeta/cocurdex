import { requestDaemon } from "@cocurdex/daemon/client";
import type { RemoteHostRecord } from "@cocurdex/shared";
import {
  app,
  BrowserWindow,
  type IpcMain,
  nativeTheme,
  session,
} from "electron";
import { z } from "zod";
import { chatDaemonOptions } from "../chat/app-state";
import { registerHandler } from "../ipc";
import { denyWindowNavigation, resolveMainWindowDevTools } from "../security";
import { registerRendererProtocol, rendererPageUrl } from "./renderer-page";
import { titleBarChromeOptions } from "./title-bar-chrome";

const SESSION_CHANNEL = "remoteHost:session";

const openRequestSchema = z.object({
  hostId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).optional(),
});

interface RemoteHostWindow {
  hostId: string;
  window: BrowserWindow;
  pendingSessionId: string | null;
}

export interface RemoteHostWindowOptions {
  preloadPath: string;
  rendererRootDir: string;
}

const windows = new Map<string, RemoteHostWindow>();

function windowFor(webContentsId: number) {
  for (const entry of windows.values()) {
    if (entry.window.webContents.id === webContentsId) return entry;
  }
  return null;
}

function partitionFor(hostId: string) {
  return `persist:remote-${hostId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

async function findRemoteHost(hostId: string): Promise<RemoteHostRecord> {
  const hosts = await requestDaemon(
    "host.remotes.list",
    await chatDaemonOptions(),
  );
  const host = hosts.find((item) => item.hostId === hostId);
  if (!host) throw new Error("This computer is no longer paired");
  return host;
}

function showSession(entry: RemoteHostWindow, sessionId: string | undefined) {
  if (!sessionId) return;
  entry.pendingSessionId = sessionId;
  entry.window.webContents.send(SESSION_CHANNEL);
}

async function openRemoteHostWindow(
  options: RemoteHostWindowOptions,
  hostId: string,
  sessionId: string | undefined,
) {
  const existing = windows.get(hostId);
  if (existing && !existing.window.isDestroyed()) {
    if (existing.window.isMinimized()) existing.window.restore();
    existing.window.focus();
    showSession(existing, sessionId);
    return;
  }
  const host = await findRemoteHost(hostId);
  const partition = partitionFor(hostId);
  registerRendererProtocol(
    options.rendererRootDir,
    session.fromPartition(partition),
  );
  const surfaceColor = nativeTheme.shouldUseDarkColors ? "#0f0f11" : "#ffffff";
  const window = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: host.name,
    backgroundColor: surfaceColor,
    ...titleBarChromeOptions(process.platform, surfaceColor),
    webPreferences: {
      preload: options.preloadPath,
      partition,
      backgroundThrottling: false,
      devTools: resolveMainWindowDevTools({ packaged: app.isPackaged }),
    },
  });
  const entry: RemoteHostWindow = {
    hostId,
    window,
    pendingSessionId: sessionId ?? null,
  };
  windows.set(hostId, entry);
  window.on("page-title-updated", (event) => event.preventDefault());
  window.on("closed", () => {
    if (windows.get(hostId) === entry) windows.delete(hostId);
  });
  denyWindowNavigation(window.webContents);
  window.once("ready-to-show", () => window.show());
  await window.loadURL(rendererPageUrl({ remoteHost: hostId }));
}

async function remoteHostWindowTarget(webContentsId: number) {
  const entry = windowFor(webContentsId);
  if (!entry) return null;
  const host = await findRemoteHost(entry.hostId);
  const endpoint = await requestDaemon(
    "host.remotes.endpoint",
    { hostId: entry.hostId },
    await chatDaemonOptions(),
  );
  return { host, endpoint };
}

export function registerRemoteHostWindowHandlers(
  ipc: IpcMain,
  options: RemoteHostWindowOptions,
) {
  registerHandler(ipc, "remoteHost:openWindow", openRequestSchema, (_e, req) =>
    openRemoteHostWindow(options, req.hostId, req.sessionId),
  );
  ipc.handle("remoteHost:target", (event) =>
    remoteHostWindowTarget(event.sender.id),
  );
  ipc.handle("remoteHost:consumeSession", (event) => {
    const entry = windowFor(event.sender.id);
    const sessionId = entry?.pendingSessionId ?? null;
    if (entry) entry.pendingSessionId = null;
    return sessionId;
  });
}
