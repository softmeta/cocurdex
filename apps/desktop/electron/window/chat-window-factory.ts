import { app, BrowserWindow, nativeTheme, screen } from "electron";
import { denyWindowNavigation, resolveMainWindowDevTools } from "../security";

export interface ChatWindowFactoryOptions {
  preloadPath: string;
  rendererHtmlPath: string;
}

export function createChatWindow(
  options: ChatWindowFactoryOptions,
  source: BrowserWindow,
) {
  const area = screen.getDisplayMatching(source.getBounds()).workArea;
  const sourceBounds = source.getBounds();
  const width = Math.min(480, area.width);
  const height = Math.min(780, area.height);
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width,
    height,
    minWidth: 375,
    minHeight: 480,
    x: Math.max(
      area.x,
      Math.min(
        sourceBounds.x + sourceBounds.width - width,
        area.x + area.width - width,
      ),
    ),
    y: Math.max(
      area.y,
      Math.min(sourceBounds.y + 32, area.y + area.height - height),
    ),
    show: false,
    title: "Cocurdex Chat",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f0f11" : "#ffffff",
    titleBarStyle: isMac ? "hidden" : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 9 } : undefined,
    webPreferences: {
      preload: options.preloadPath,
      backgroundThrottling: false,
      devTools: resolveMainWindowDevTools({ packaged: app.isPackaged }),
    },
  });
  const bounds = window.getBounds();
  const content = window.getContentBounds();
  window.setMinimumSize(
    375 + bounds.width - content.width,
    480 + bounds.height - content.height,
  );
  denyWindowNavigation(window.webContents);
  return window;
}

export async function loadChatWindow(
  window: BrowserWindow,
  options: ChatWindowFactoryOptions,
) {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    const url = new URL(rendererUrl);
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      url.searchParams.set("window", "chat");
      await window.loadURL(url.toString());
      return;
    }
  }
  await window.loadFile(options.rendererHtmlPath, {
    query: { window: "chat" },
  });
}
