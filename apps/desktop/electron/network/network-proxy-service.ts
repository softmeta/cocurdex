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

/**
 * Call after applyShellEnv so the system/shell snapshot is accurate before any
 * app setting is overlaid.
 */
export function initializeNetworkProxyRuntime() {
  captureSystemProxySnapshot(process.env);
  // Enable Node env-proxy for main-process fetch even before settings load.
  process.env.NODE_USE_ENV_PROXY = "1";
  // Chromium's proxyRules grammar has no userinfo slot, so credentials from a
  // manual proxy URL only reach it through this auth challenge. Non-proxy
  // (site) challenges are left to the default handling.
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

// The daemon owns the stored setting; the host mirrors it onto its own
// process.env and the Chromium session so renderer and main-process traffic
// follow the same policy.
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
