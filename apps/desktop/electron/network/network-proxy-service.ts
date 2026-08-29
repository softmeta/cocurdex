import {
  applyNetworkProxySettings,
  buildElectronProxyConfig,
  captureSystemProxySnapshot,
  getManualProxyCredentials,
  getNetworkProxySettings,
  isManualProxyIncomplete,
  isValidProxyUrl,
  loadNetworkProxySettingsFromJson,
  NETWORK_PROXY_SETTING_KEY,
  type NetworkProxySettings,
  normalizeNetworkProxySettings,
  parseNetworkProxySettings,
  serializeNetworkProxySettings,
} from "@cocurdex/shared";
import { app, ipcMain, session } from "electron";
import {
  getNetworkProxySetting,
  setNetworkProxySetting,
  testNetworkProxy as testDaemonNetworkProxy,
} from "../chat/app-state";

let applied = false;
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

export async function loadAndApplyNetworkProxyFromStorage() {
  const raw = await getNetworkProxySetting();
  const settings = loadNetworkProxySettingsFromJson(raw, process.env);
  await applyElectronNetworkProxy(settings);
  applied = true;
  return settings;
}

export async function saveAndApplyNetworkProxySettings(
  input: NetworkProxySettings,
): Promise<NetworkProxySettings> {
  const settings = normalizeNetworkProxySettings(input);
  const operation = applyQueue.then(async () => {
    await setNetworkProxySetting(serializeNetworkProxySettings(settings));
    // Daemon also re-applies via appSetting.set side effect; keep main in sync.
    applyNetworkProxySettings(settings, process.env);
    await applyElectronNetworkProxy(settings);
    applied = true;
  });
  applyQueue = operation.catch(() => undefined);
  await operation;
  return settings;
}

async function applyElectronNetworkProxy(settings: NetworkProxySettings) {
  const config = buildElectronProxyConfig(settings);
  await session.defaultSession.setProxy({
    mode: config.mode,
    proxyRules: config.proxyRules,
    proxyBypassRules: config.proxyBypassRules,
  });
}

export function registerNetworkProxyHandlers() {
  ipcMain.handle(
    "network:testProxy",
    async (_event, input: NetworkProxySettings) => {
      const settings = normalizeNetworkProxySettings(input);
      if (isManualProxyIncomplete(settings)) {
        throw new Error("Manual proxy mode requires at least one proxy URL");
      }
      const invalidProxy = [
        settings.httpProxy,
        settings.httpsProxy,
        settings.allProxy,
      ].find((value) => !isValidProxyUrl(value));
      if (invalidProxy) {
        throw new Error(`Invalid proxy URL: ${invalidProxy}`);
      }
      await saveAndApplyNetworkProxySettings(settings);
      return testDaemonNetworkProxy();
    },
  );
  ipcMain.handle("network:testCurrentProxy", async () => {
    if (!applied) {
      await loadAndApplyNetworkProxyFromStorage();
    }
    return testDaemonNetworkProxy();
  });
  ipcMain.handle("network:getProxySettings", async () => {
    if (applied) {
      return getNetworkProxySettings();
    }
    const raw = await getNetworkProxySetting();
    return parseNetworkProxySettings(raw);
  });
  ipcMain.handle(
    "network:setProxySettings",
    async (_event, settings: NetworkProxySettings) =>
      saveAndApplyNetworkProxySettings(settings),
  );
}

export { NETWORK_PROXY_SETTING_KEY };
