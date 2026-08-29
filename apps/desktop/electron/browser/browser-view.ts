import type { BrowserAnnotation } from "@cocurdex/shared";
import { BrowserWindow, WebContentsView } from "electron";
import { resolveElectronEntryPath } from "../app-paths";
import { getAnnotationScript } from "./annotation-script";

let browserView: WebContentsView | null = null;
let annotationListeners: Array<(annotation: BrowserAnnotation) => void> = [];
// Annotation script lives inside the page and is wiped on every navigation;
// track the desired mode so we can re-inject after the next page loads.
let annotationModeEnabled = false;
const browserPreloadPath = resolveElectronEntryPath(
  import.meta.url,
  "../preload/browser-preload.cjs",
);

export function createBrowserView() {
  if (browserView) {
    return browserView;
  }

  browserView = new WebContentsView({
    webPreferences: {
      preload: browserPreloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      // Isolate internet content from the default session so privileged
      // custom protocols registered there (e.g. pdf-asset:) are unreachable
      // from arbitrary web pages.
      partition: "persist:browser-content",
      // This view renders arbitrary internet content. The OS sandbox is the
      // backstop if the renderer itself is exploited — without it a V8 bug
      // hands the page full Node access despite context isolation.
      sandbox: true,
    },
  });

  browserView.setVisible(false);

  // Deny window.open entirely: popups would inherit this view's preload
  // (including the annotation bridge) and escape the app's UI management.
  browserView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  browserView.webContents.on("did-navigate", (_event, url) => {
    broadcast("browser:loading", false);
    broadcast("browser:navigated", url);
  });

  browserView.webContents.on(
    "did-navigate-in-page",
    (_event, url, isMainFrame) => {
      if (isMainFrame) {
        broadcast("browser:navigated", url);
      }
    },
  );

  browserView.webContents.on("did-start-loading", () => {
    broadcast("browser:loading", true);
  });

  browserView.webContents.on("did-stop-loading", () => {
    broadcast("browser:loading", false);
  });

  browserView.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      // -3 is ERR_ABORTED: fired for cancelled loads (user navigated away,
      // stop button, redirects) — not a real failure worth an error page.
      if (!isMainFrame || errorCode === -3) {
        return;
      }
      broadcast("browser:loading", false);
      broadcast("browser:error", {
        url: validatedURL,
        message: errorDescription,
      });
    },
  );

  browserView.webContents.on("did-finish-load", () => {
    if (annotationModeEnabled) {
      void reinjectAnnotationMode(browserView);
    }
  });

  browserView.webContents.on(
    "page-title-updated",
    (_event, title, _explicitSet) => {
      broadcast("browser:title", title);
    },
  );

  return browserView;
}

function broadcast(channel: string, payload: unknown) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(channel, payload);
  }
}

async function reinjectAnnotationMode(view: WebContentsView | null) {
  if (!view || !annotationModeEnabled) {
    return;
  }
  await view.webContents.executeJavaScript(getAnnotationScript());
  view.webContents.send("browser:annotation:toggle", true);
}

export function getBrowserView(): WebContentsView | null {
  return browserView;
}

export function addAnnotationListener(
  listener: (annotation: BrowserAnnotation) => void,
) {
  annotationListeners.push(listener);
  return () => {
    annotationListeners = annotationListeners.filter((l) => l !== listener);
  };
}

export async function toggleBrowserAnnotationMode(enabled: boolean) {
  annotationModeEnabled = enabled;
  const view = getBrowserView();
  if (!view) {
    return;
  }

  if (enabled) {
    await view.webContents.executeJavaScript(getAnnotationScript());
  }

  view.webContents.send("browser:annotation:toggle", enabled);
}
