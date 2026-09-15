import { requestDaemon } from "@cocurdex/daemon/client";
import { ipcMain } from "electron";
import { chatDaemonOptions } from "../chat/app-state";
import { registerHandler, schemas } from "../ipc";

// Skill pack install/remove is product behavior shared by desktop and future
// headless clients, so the daemon owns it; the host validates and forwards.
export function registerSkillsHandlers(): void {
  registerHandler(
    ipcMain,
    "skills:getStatus",
    schemas.skillsRequest,
    async (_event, payload) =>
      requestDaemon("skills.getStatus", payload, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "skills:install",
    schemas.skillsRequest,
    async (_event, payload) =>
      requestDaemon("skills.install", payload, await chatDaemonOptions()),
  );
  registerHandler(
    ipcMain,
    "skills:remove",
    schemas.skillsRequest,
    async (_event, payload) =>
      requestDaemon("skills.remove", payload, await chatDaemonOptions()),
  );
}
