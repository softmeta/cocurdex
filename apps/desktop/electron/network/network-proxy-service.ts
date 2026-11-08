import { requestDaemon } from "@cocurdex/daemon/client";
import {
  applyNetworkProxySettings,
  buildElectronProxyConfig,
  captureSystemProxySnapshot,
  getManualProxyCredentials,
  getNetworkProxySettings,
  type NetworkProxySettings,
} from "@cocurdex/shared";
import { applyNodeGlobalProxy } from "@cocurdex/shared/node";
import { app, session } from "electron";
import { chatDaemonOptions } from "../chat/app-state";

let applyQueue: Promise<void> = Promise.resolve();

export function initializeNetworkProxyRuntime() {
  captureSystemProxySnapshot(process.env);
  process.env.NODE_USE_ENV_PROXY = "1";
  app.on("login", (event, _webContents, _request, authInfo, callback) => {
    if (!authInfo.isProxy) {
      return;
    }
    const credentials = getManualProxyCredentials(getNetworkProxySettings());
    if (!credentials) {
      return;
    }
    event.preventDefault();
    callback(credentials.username, credentials.password);
  });
}

function applyHostNetworkProxy(settings: NetworkProxySettings) {
  const operation = applyQueue.then(async () => {
    applyNetworkProxySettings(settings, process.env);
    applyNodeGlobalProxy(process.env);
    const config = buildElectronProxyConfig(settings);
    await session.defaultSession.setProxy({
      mode: config.mode,
      proxyRules: config.proxyRules,
      proxyBypassRules: config.proxyBypassRules,
    });
  });
  applyQueue = operation.catch(() => undefined);
  return operation;
}

export async function loadAndApplyNetworkProxyFromDaemon() {
  const settings = await requestDaemon(
    "network.proxy.get",
    await chatDaemonOptions(),
  );
  await applyHostNetworkProxy(settings);
  return settings;
}
