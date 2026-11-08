import {
  applyNetworkProxyToEnv,
  type EnvMap,
  type NetworkProxySettings,
  parseNetworkProxySettings,
  pickProxyEnv,
} from "./network-proxy";

let systemProxySnapshot: EnvMap = {};
let snapshotCaptured = false;
let currentSettings: NetworkProxySettings = parseNetworkProxySettings(null);

export function captureSystemProxySnapshot(env: EnvMap): EnvMap {
  systemProxySnapshot = pickProxyEnv(env);
  snapshotCaptured = true;
  return { ...systemProxySnapshot };
}

export function getSystemProxySnapshot(): EnvMap {
  return { ...systemProxySnapshot };
}

export function getNetworkProxySettings(): NetworkProxySettings {
  return { ...currentSettings };
}

export function applyNetworkProxySettings(
  settings: NetworkProxySettings,
  env: EnvMap,
): NetworkProxySettings {
  if (!snapshotCaptured) {
    captureSystemProxySnapshot(env);
  }
  currentSettings = settings;
  applyNetworkProxyToEnv(env, settings, systemProxySnapshot);
  return { ...currentSettings };
}

export function loadNetworkProxySettingsFromJson(
  raw: string | null | undefined,
  env: EnvMap,
): NetworkProxySettings {
  return applyNetworkProxySettings(parseNetworkProxySettings(raw), env);
}
