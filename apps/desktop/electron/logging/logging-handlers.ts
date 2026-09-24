import type { RendererLogPayload } from "@cocurdex/shared";
import { app, ipcMain } from "electron";
import { listCrashDumps } from "./crash-reporter";
import {
  exportDiagnostics,
  isDiagnosticsVerbose,
  logRendererPayload,
  setDiagnosticsVerbose,
} from "./logger";

export function registerLoggingHandlers() {
  ipcMain.handle(
    "log:rendererError",
    async (_event, payload: RendererLogPayload) => {
      logRendererPayload(payload);
    },
  );

  ipcMain.handle("diagnostics:export", async () =>
    exportDiagnostics({
      crashReports: await listCrashDumps(app.getPath("crashDumps")),
    }),
  );

  ipcMain.handle("diagnostics:getVerbose", async () => isDiagnosticsVerbose());

  ipcMain.handle("diagnostics:setVerbose", async (_event, enabled: unknown) => {
    setDiagnosticsVerbose(enabled === true);
    return isDiagnosticsVerbose();
  });
}
