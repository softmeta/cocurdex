import type { WebContents } from "electron";

export function denyWindowNavigation(webContents: WebContents) {
  webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}
