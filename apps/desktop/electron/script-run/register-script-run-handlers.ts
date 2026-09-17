import { requestDaemon } from "@cocurdex/daemon/client";
import {
  SCRIPT_RUN_HARD_MAX_AGENTS,
  SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS,
} from "@cocurdex/shared";
import type { IpcMain } from "electron";
import { z } from "zod";
import { idSchema, registerHandler } from "../ipc";

const maxAgentsSchema = z.number().int().min(1).max(SCRIPT_RUN_HARD_MAX_AGENTS);

const startSchema = z.object({
  runId: idSchema,
  maxAgents: maxAgentsSchema.optional(),
});

const settingsSchema = z.object({
  defaultMaxAgents: maxAgentsSchema,
  schemaMaxAttempts: z
    .number()
    .int()
    .min(1)
    .max(SCRIPT_RUN_MAX_SCHEMA_ATTEMPTS),
  maxDurationMinutes: z.number().int().min(1).nullable(),
});

export function registerScriptRunHandlers(
  ipc: IpcMain,
  userDataPath: string,
): void {
  const options = { userDataPath };

  registerHandler(ipc, "scriptRun:list", idSchema, (_event, sessionId) =>
    requestDaemon("scriptRun.list", { requesterSessionId: sessionId }, options),
  );
  registerHandler(ipc, "scriptRun:get", idSchema, (_event, runId) =>
    requestDaemon("scriptRun.get", { runId }, options),
  );
  registerHandler(ipc, "scriptRun:start", startSchema, (_event, payload) =>
    requestDaemon("scriptRun.start", payload, options),
  );
  registerHandler(ipc, "scriptRun:cancel", idSchema, (_event, runId) =>
    requestDaemon("scriptRun.cancel", { runId }, options),
  );
  ipc.handle("scriptRun:getSettings", () =>
    requestDaemon("scriptRun.settings.get", options),
  );
  registerHandler(
    ipc,
    "scriptRun:saveSettings",
    settingsSchema,
    (_event, settings) =>
      requestDaemon("scriptRun.settings.save", settings, options),
  );
}
