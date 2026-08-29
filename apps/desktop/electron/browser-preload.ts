import { contextBridge, ipcRenderer } from "electron";

const toggleCallbacks: Array<(enabled: boolean) => void> = [];

ipcRenderer.on("browser:annotation:toggle", (_event, enabled: boolean) => {
  for (const cb of toggleCallbacks) {
    try {
      cb(enabled);
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
  sendAnnotation(data: unknown) {
    ipcRenderer.send("browser:annotation", data);
  },
});
