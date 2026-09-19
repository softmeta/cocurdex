import { type IpcRendererEvent, ipcRenderer } from "electron";
import type { ChatWindowApi } from "../../src/lib/chat-window-types";

function subscribe<T>(channel: string, listener: (value: T) => void) {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const chatWindowApi: ChatWindowApi = {
  dispatchIntent: (request) =>
    ipcRenderer.invoke("chatWindow:dispatchIntent", request),
  getPendingIntents: () => ipcRenderer.invoke("chatWindow:pendingIntents"),
  acknowledgeIntent: (id) =>
    ipcRenderer.invoke("chatWindow:acknowledgeIntent", id),
  onIntentAvailable: (listener) =>
    subscribe("chatWindow:intentAvailable", listener),
  setBrowserContext: (annotations) =>
    ipcRenderer.invoke("chatWindow:setBrowserContext", annotations),
  getBrowserContext: () => ipcRenderer.invoke("chatWindow:browserContext"),
  onBrowserContext: (listener) =>
    subscribe("chatWindow:browserContext", listener),
  detach: (snapshot) => ipcRenderer.invoke("chatWindow:detach", snapshot),
  reattach: (snapshot) => ipcRenderer.invoke("chatWindow:reattach", snapshot),
  bootstrap: () => ipcRenderer.invoke("chatWindow:bootstrap"),
  ready: (id) => ipcRenderer.invoke("chatWindow:ready", id),
  checkpoint: (snapshot) =>
    ipcRenderer.invoke("chatWindow:checkpoint", snapshot),
  focus: () => ipcRenderer.invoke("chatWindow:focus"),
  toggleVisibility: () => ipcRenderer.invoke("chatWindow:toggleVisibility"),
  getState: () => ipcRenderer.invoke("chatWindow:state"),
  onState: (listener) => subscribe("chatWindow:state", listener),
  onTransfer: (listener) => subscribe("chatWindow:transfer", listener),
};
