import {
  isManualProxyIncomplete,
  type NetworkProxySettings,
  type NetworkProxyTestResult,
} from "@cocurdex/shared";

export type NetworkProxyStatusTone =
  | "unknown"
  | "off"
  | "incomplete"
  | "ok"
  | "error"
  | "checking";

export function resolveNetworkProxyStatusTone(params: {
  settings: NetworkProxySettings | null;
  result: NetworkProxyTestResult | null;
  testing: boolean;
}): NetworkProxyStatusTone {
  if (params.testing) {
    return "checking";
  }
  if (!params.settings) {
    return "unknown";
  }
  if (isManualProxyIncomplete(params.settings)) {
    return "incomplete";
  }
  if (params.result?.ok === true) {
    return "ok";
  }
  if (params.result?.ok === false) {
    return "error";
  }
  if (params.settings.mode === "off") {
    return "off";
  }
  return "unknown";
}

export const MANUAL_PROXY_ENDPOINT_FIELDS = [
  "httpProxy",
  "httpsProxy",
  "allProxy",
] as const satisfies ReadonlyArray<keyof NetworkProxySettings>;

export type ManualProxyEndpointField =
  (typeof MANUAL_PROXY_ENDPOINT_FIELDS)[number];

export function listManualProxyEndpoints(
  settings: NetworkProxySettings,
): Array<{ field: ManualProxyEndpointField; url: string }> {
  if (settings.mode !== "manual") {
    return [];
  }
  return MANUAL_PROXY_ENDPOINT_FIELDS.flatMap((field) => {
    const url = settings[field];
    return url ? [{ field, url }] : [];
  });
}
