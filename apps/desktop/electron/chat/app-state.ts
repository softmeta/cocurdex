let daemonUserDataPath: string | null = null;
let daemonReady: Promise<unknown> = Promise.resolve();

function daemonOptions() {
  if (!daemonUserDataPath) {
    throw new Error("App state daemon client not initialized");
  }
  return { userDataPath: daemonUserDataPath };
}

export async function chatDaemonOptions() {
  await daemonReady;
  return daemonOptions();
}

export function initializeAppState(userDataPath: string) {
  daemonUserDataPath = userDataPath;
}

export function setDaemonReady(ready: Promise<unknown>) {
  daemonReady = ready.catch(() => undefined);
}
