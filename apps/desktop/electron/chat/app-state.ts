let daemonUserDataPath: string | null = null;
// Resolves once the runtime client has the daemon up. The window is created
// without waiting for that (so the renderer boots in parallel), which means
// every call here has to gate on it or it would connect to a socket that does
// not exist yet. A failed start still resolves: the call then fails with the
// real connection error instead of hanging forever.
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
