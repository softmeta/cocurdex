import { requestDaemon } from "@cocurdex/daemon/client";
import type { HostRemoteAccessStatus } from "@cocurdex/shared";
import { powerSaveBlocker } from "electron";
import { chatDaemonOptions } from "../chat";

function shouldKeepAwake(status: HostRemoteAccessStatus) {
  return status.listening && status.settings.keepAwake;
}

let blockerId: number | null = null;
let applyQueue = Promise.resolve();

function setKeepAwake(keepAwake: boolean) {
  if (keepAwake && blockerId === null) {
    blockerId = powerSaveBlocker.start("prevent-app-suspension");
    return;
  }
  if (!keepAwake && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

export function syncKeepAwakeFromDaemon() {
  const operation = applyQueue.then(async () => {
    const status = await requestDaemon(
      "host.remoteAccess.get",
      await chatDaemonOptions(),
    );
    setKeepAwake(shouldKeepAwake(status));
  });
  applyQueue = operation.catch(() => undefined);
  return operation;
}
