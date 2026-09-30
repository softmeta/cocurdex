import type { BrowserTab } from "@cocurdex/shared";
import { WebContentsView } from "electron";
import { resolveElectronEntryPath } from "../app-paths";
import { getAnnotationScript } from "./annotation-script";
import { registerBrowserHtmlProtocol } from "./html-preview-protocol";

const PAGE_BACKGROUND_SCRIPT = `(() => {
  const opaque = (color) => color && color !== "transparent" && !/,\\s*0\\)$/.test(color);
  const root = getComputedStyle(document.documentElement).backgroundColor;
  if (opaque(root)) return root;
  const body = document.body && getComputedStyle(document.body).backgroundColor;
  return opaque(body) ? body : null;
})()`;

export function createBrowserView(state: BrowserTab, changed: () => void) {
  const view = new WebContentsView({
    webPreferences: {
      preload: resolveElectronEntryPath(
        import.meta.url,
        "../preload/browser-preload.cjs",
      ),
      contextIsolation: true,
      nodeIntegration: false,
      partition: "persist:browser-content",
      sandbox: true,
    },
  });
  let annotationMode = false;
  view.setVisible(false);
  registerBrowserHtmlProtocol(view.webContents.session);
  view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const navigated = (url: string) => {
    state.url = url;
    state.error = null;
    state.previewError = undefined;
    changed();
  };
  view.webContents.on("did-navigate", (_event, url) => navigated(url));
  view.webContents.on("did-navigate-in-page", (_event, url, main) => {
    if (main) navigated(url);
  });
  view.webContents.on("did-start-loading", () => {
    state.loading = true;
    changed();
  });
  view.webContents.on("did-stop-loading", () => {
    state.loading = false;
    changed();
  });
  view.webContents.on("did-fail-load", (_event, code, message, _url, main) => {
    if (!main || code === -3) return;
    state.loading = false;
    state.error = message;
    changed();
  });
  view.webContents.on("page-title-updated", (_event, title) => {
    state.title = title;
    changed();
  });
  const toggleAnnotation = async (enabled: boolean) => {
    annotationMode = enabled;
    if (enabled)
      await view.webContents.executeJavaScript(getAnnotationScript());
    if (!view.webContents.isDestroyed()) {
      view.webContents.send("browser:annotation:toggle", enabled);
    }
  };
  let backgroundSyncedAt = 0;
  const syncBackground = async () => {
    backgroundSyncedAt = Date.now();
    const color = await view.webContents
      .executeJavaScriptInIsolatedWorld(999, [{ code: PAGE_BACKGROUND_SCRIPT }])
      .catch(() => null);
    if (typeof color === "string" && !view.webContents.isDestroyed())
      view.setBackgroundColor(color);
  };
  const syncBackgroundBeforeResize = () => {
    if (Date.now() - backgroundSyncedAt > 500) void syncBackground();
  };
  view.webContents.on("did-finish-load", () => {
    void syncBackground();
    if (annotationMode) void toggleAnnotation(true).catch(() => {});
  });
  view.webContents.on("did-navigate-in-page", () => void syncBackground());
  return { view, toggleAnnotation, syncBackgroundBeforeResize };
}
