import { requestDaemon } from "@cocurdex/daemon/client";
import type { RendererLogPayload } from "@cocurdex/shared";
import { formatErrorForLog } from "@cocurdex/shared/node";
import { app, ipcMain } from "electron";
import { chatDaemonOptions } from "../chat/app-state";
import { listCrashDumps } from "./crash-reporter";
import {
  createLogger,
  daemonDiagnosticsLogLevel,
  exportDiagnostics,
  isDiagnosticsVerbose,
  logRendererPayload,
  setDiagnosticsVerbose,
} from "./logger";

async function applyDaemonLogLevel() {
  try {
    await requestDaemon(
      "diagnostics.logLevel.set",
      { level: daemonDiagnosticsLogLevel() },
      await chatDaemonOptions(),
    );
  } catch (error) {
    createLogger("diagnostics").warn("diagnostics.daemonLevelFailed", {
      error: formatErrorForLog(error),
    });
  }
}

export async function exportAppDiagnostics() {
  return exportDiagnostics({
    crashReports: await listCrashDumps(app.getPath("crashDumps")),
    daemon: await chatDaemonOptions(),
  });
}

export function registerLoggingHandlers() {
  ipcMain.handle(
    "log:rendererError",
    async (_event, payload: RendererLogPayload) => {
      logRendererPayload(payload);
    },
  );

  ipcMain.handle("diagnostics:export", () => exportAppDiagnostics());

  ipcMain.handle("diagnostics:getVerbose", async () => isDiagnosticsVerbose());

  ipcMain.handle("diagnostics:setVerbose", async (_event, enabled: unknown) => {
    setDiagnosticsVerbose(enabled === true);
    await applyDaemonLogLevel();
    return isDiagnosticsVerbose();
  });
}
