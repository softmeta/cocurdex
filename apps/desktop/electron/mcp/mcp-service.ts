import { requestDaemon } from "@cocurdex/daemon/client";
import { ipcMain } from "electron";
import { chatDaemonOptions } from "../chat/app-state";
import { registerHandler, schemas } from "../ipc";

// mcp.json lives under the shared userData path, so the daemon owns reads and
// writes; the host only validates the payload and forwards.
export function registerMcpHandlers() {
  ipcMain.handle("mcp:readConfig", async () =>
    requestDaemon("mcp.readConfig", await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "mcp:saveConfig",
    schemas.mcpSaveConfig,
    async (_event, content) =>
      requestDaemon("mcp.saveConfig", { content }, await chatDaemonOptions()),
  );
}
