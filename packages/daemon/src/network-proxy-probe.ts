import type {
  EnvMap,
  NetworkProxySettings,
  NetworkProxyTestResult,
} from "@cocurdex/shared";
import {
  getSystemProxySnapshot,
  isManualProxyIncomplete,
  isValidProxyUrl,
  resolveProxyEnvAssignments,
} from "@cocurdex/shared";
import { Agent, type Dispatcher, EnvHttpProxyAgent, fetch } from "undici";

const DEFAULT_PROBE_URL = "https://ipinfo.io/json";
const DEFAULT_TIMEOUT_MS = 10_000;

interface NetworkProxyProbeOptions {
  systemProxyEnv?: EnvMap;
  timeoutMs?: number;
  url?: string;
}

function firstValue(...values: (string | undefined)[]): string | undefined {
  return values.find((value) => Boolean(value));
}

function createDispatcher(
  settings: NetworkProxySettings,
  systemProxyEnv: EnvMap,
): Dispatcher {
  const assignments = resolveProxyEnvAssignments(settings, systemProxyEnv);
  const allProxy = firstValue(assignments.ALL_PROXY, assignments.all_proxy);
  const httpProxy = firstValue(
    assignments.HTTP_PROXY,
    assignments.http_proxy,
    allProxy,
  );
  const httpsProxy = firstValue(
    assignments.HTTPS_PROXY,
    assignments.https_proxy,
    httpProxy,
    allProxy,
  );

  if (!httpProxy && !httpsProxy) {
    return new Agent();
  }

  return new EnvHttpProxyAgent({
    httpProxy,
    httpsProxy,
    noProxy: firstValue(assignments.NO_PROXY, assignments.no_proxy) ?? "",
  });
}

export async function probeNetworkProxy(
  settings: NetworkProxySettings,
  options: NetworkProxyProbeOptions = {},
): Promise<NetworkProxyTestResult> {
  if (isManualProxyIncomplete(settings)) {
    return {
      ok: false,
      durationMs: 0,
      error: "Manual proxy mode requires at least one proxy URL",
    };
  }
  const invalidProxy = [
    settings.httpProxy,
    settings.httpsProxy,
    settings.allProxy,
  ].find((value) => !isValidProxyUrl(value));
  if (invalidProxy) {
    return {
      ok: false,
      durationMs: 0,
      error: `Invalid proxy URL: ${invalidProxy}`,
    };
  }

  const startedAt = Date.now();
  let dispatcher: Dispatcher | undefined;

  try {
    dispatcher = createDispatcher(
      settings,
      options.systemProxyEnv ?? getSystemProxySnapshot(),
    );
    const response = await fetch(options.url ?? DEFAULT_PROBE_URL, {
      dispatcher,
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      return {
        ok: false,
        durationMs,
        error: `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as Record<string, unknown>;
    const read = (key: string): string | null => {
      const value = body[key];
      return typeof value === "string" ? value : null;
    };

    return {
      ok: true,
      durationMs,
      ip: read("ip"),
      city: read("city"),
      country: read("country"),
      org: read("org"),
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await dispatcher?.close();
  }
}
