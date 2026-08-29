import type { WebContents } from "electron";

// The main window hosts only the bundled SPA and never legitimately navigates
// away from it. Denying every will-navigate attempt stops a compromised
// renderer (or a link Electron did not intercept) from loading remote content
// with the privileged desktopApi preload attached. External links flow
// through shell:openExternal; programmatic loadURL/loadFile are unaffected.
//
// window.open / <a target="_blank"> are a separate channel: without a
// setWindowOpenHandler the default is to spawn an empty BrowserWindow (what
// users saw when TipTap links defaulted to target=_blank). Deny popups here
// so note/editor links never open a second app chrome.
export function denyWindowNavigation(webContents: WebContents) {
  webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
