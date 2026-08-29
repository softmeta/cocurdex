import type { RendererLogPayload } from "@cocurdex/shared";
import { ipcMain } from "electron";
import { exportDiagnostics, logRendererPayload } from "./logger";

export function registerLoggingHandlers() {
  ipcMain.handle(
    "log:rendererError",
    async (_event, payload: RendererLogPayload) => {
      logRendererPayload(payload);
    },
  );

  ipcMain.handle("diagnostics:export", async () => exportDiagnostics());
}
