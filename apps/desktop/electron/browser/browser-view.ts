import type { BrowserTab } from "@cocurdex/shared";
import { WebContentsView } from "electron";
import { resolveElectronEntryPath } from "../app-paths";
import { getAnnotationScript } from "./annotation-script";
import { registerBrowserHtmlProtocol } from "./html-preview-protocol";

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
  view.webContents.on("did-finish-load", () => {
    if (annotationMode) void toggleAnnotation(true).catch(() => {});
  });
  return { view, toggleAnnotation };
}
