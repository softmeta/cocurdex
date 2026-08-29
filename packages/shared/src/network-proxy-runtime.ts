/**
 * Process-scoped network proxy runtime helpers.
 *
 * Callers own the env map (usually `process.env` in Node/Electron). Capture the
 * shell/system proxy snapshot once after login-shell inheritance, then re-apply
 * app settings whenever the user changes proxy mode.
 */

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

/**
 * Persist the in-memory settings and rewrite proxy-related keys on `env`.
 * Safe to call repeatedly.
 */
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
