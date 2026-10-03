import { contextBridge, ipcRenderer } from "electron";

const toggleCallbacks: Array<(enabled: boolean) => void> = [];
const markerCallbacks: Array<(ids: string[]) => void> = [];

ipcRenderer.on("browser:annotation:toggle", (_event, enabled: boolean) => {
  for (const cb of toggleCallbacks) {
    try {
      cb(enabled);
    } catch {
      // ignore callback errors
    }
  }
});

ipcRenderer.on("browser:annotation:markers", (_event, ids: string[]) => {
  for (const cb of markerCallbacks) {
    try {
      cb(ids);
    } catch {
      // ignore callback errors
    }
  }
});

contextBridge.exposeInMainWorld("__annotationBridge__", {
  onToggle(callback: (enabled: boolean) => void) {
    toggleCallbacks.push(callback);
    return () => {
      const index = toggleCallbacks.indexOf(callback);
      if (index !== -1) {
        toggleCallbacks.splice(index, 1);
      }
    };
  },
  onMarkers(callback: (ids: string[]) => void) {
    markerCallbacks.push(callback);
  },
  sendAction(action: unknown) {
    ipcRenderer.send("browser:annotation:action", action);
  },
  sendAnnotation(data: unknown, submit: unknown) {
    ipcRenderer.send("browser:annotation", data, submit === true);
  },
});
