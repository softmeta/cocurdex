import type { AgentEvent, DaemonEventMeta, TaskApi } from "@cocurdex/shared";
import { contextBridge, ipcRenderer } from "electron";

export function exposeTaskApi() {
  const api: TaskApi = {
    submitPreviousMessage: (input) =>
      ipcRenderer.invoke("task:resubmit", input),
    getPreviousMessageCheckpointStatus: (sessionId, messageId) =>
      ipcRenderer.invoke("task:checkpointStatus", sessionId, messageId),
    listSessions: () => ipcRenderer.invoke("task:list"),
    getSessionSnapshot: (sessionId) =>
      ipcRenderer.invoke("task:snapshot", sessionId),
    saveSessionConfiguration: (input) =>
      ipcRenderer.invoke("task:configure", input),
    sendMessage: (input) => ipcRenderer.invoke("task:send", input),
    stopSession: (sessionId) => ipcRenderer.invoke("session:stop", sessionId),
    resolvePermission: (id, decision) =>
      ipcRenderer.invoke("permission:resolve", id, decision),
    resolveQuestion: (id, answer) =>
      ipcRenderer.invoke("question:resolve", id, answer),
    resolvePlanApproval: (id, decision) =>
      ipcRenderer.invoke("planApproval:resolve", id, decision),
    onAgentEvent(listener) {
      const handler = (
        _event: Electron.IpcRendererEvent,
        event: AgentEvent,
        meta: DaemonEventMeta,
      ) => listener(event, meta);
      ipcRenderer.on("agent:event", handler);
      return () => ipcRenderer.removeListener("agent:event", handler);
    },
  };
  contextBridge.exposeInMainWorld("taskApi", api);
}
