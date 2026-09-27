import type { NetworkProxySettings } from "@cocurdex/shared";
import {
  isManualProxyIncomplete,
  isValidProxyUrl,
  normalizeNetworkProxySettings,
  parseNetworkProxySettings,
  serializeNetworkProxySettings,
} from "@cocurdex/shared";
import type { DaemonState } from "./state";

type ProxySettingState = Pick<
  DaemonState,
  "getNetworkProxySettingJson" | "setNetworkProxySettingJson"
>;

export async function readNetworkProxySettings(
  state: ProxySettingState,
): Promise<NetworkProxySettings> {
  return parseNetworkProxySettings(await state.getNetworkProxySettingJson());
}

export async function saveNetworkProxySettings(
  state: ProxySettingState,
  input: NetworkProxySettings,
): Promise<NetworkProxySettings> {
  const settings = normalizeNetworkProxySettings(input);
  await state.setNetworkProxySettingJson(
    serializeNetworkProxySettings(settings),
  );
  return settings;
}

export function assertTestableNetworkProxySettings(
  input: NetworkProxySettings,
): void {
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
}
