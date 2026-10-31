import {
  HOST_PAIRING_HTTP_PATH,
  HOST_SESSION_HTTP_PATH,
  type HostAccessSession,
  type HostPairingExchangeResult,
} from "@cocurdex/shared";
import type { HostEndpoint } from "./platform";
import {
  type SavedHost,
  type SavedHostStore,
  savedHostOrigins,
  uniqueOrigins,
} from "./saved-hosts";

export type HostAccessFailure = "invalid" | "rateLimited" | "unreachable";

export class HostAccessError extends Error {
  readonly reason: HostAccessFailure;

  constructor(reason: HostAccessFailure, message: string) {
    super(message);
    this.name = "HostAccessError";
    this.reason = reason;
  }
}

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

interface HostHttpOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

const HOST_REQUEST_TIMEOUT_MS = 10_000;

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function callHost(
  options: HostHttpOptions,
  path: string,
  init: RequestInit,
) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? HOST_REQUEST_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await fetchImpl(new URL(path, options.baseUrl).toString(), {
      ...init,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    throw new HostAccessError(
      "unreachable",
      controller.signal.aborted ? "The host did not answer" : errorText(error),
    );
  } finally {
    clearTimeout(timeout);
  }
  if (response.status === 401) {
    throw new HostAccessError("invalid", "The host rejected this device");
  }
  if (response.status === 429) {
    throw new HostAccessError("rateLimited", "Too many attempts");
  }
  if (!response.ok) {
    throw new HostAccessError(
      "unreachable",
      `The host answered ${response.status}`,
    );
  }
  return response;
}

export async function exchangeHostPairing(
  options: HostHttpOptions & { code: string; label?: string },
): Promise<HostPairingExchangeResult> {
  const response = await callHost(options, HOST_PAIRING_HTTP_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: options.code, label: options.label }),
  });
  return (await response.json()) as HostPairingExchangeResult;
}

export async function verifyHostCredential(
  options: HostHttpOptions & { token: string },
): Promise<HostAccessSession> {
  const response = await callHost(options, HOST_SESSION_HTTP_PATH, {
    method: "GET",
    headers: { authorization: `Bearer ${options.token}` },
  });
  return (await response.json()) as HostAccessSession;
}

export async function pairHost(
  options: HostHttpOptions & {
    code: string;
    label?: string;
    store: SavedHostStore;
    now?(): Date;
  },
): Promise<SavedHost> {
  const result = await exchangeHostPairing(options);
  const baseUrl = new URL(options.baseUrl).origin;
  const saved: SavedHost = {
    hostId: result.host.hostId,
    name: result.host.name,
    baseUrl,
    endpoints: uniqueOrigins([baseUrl, ...(result.endpoints ?? [])]),
    deviceId: result.deviceId,
    token: result.token,
    scopes: result.scopes,
    pairedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  options.store.save(saved);
  return saved;
}

export function savedHostEndpoint(
  host: Pick<SavedHost, "baseUrl" | "token">,
): HostEndpoint {
  const { protocol, host: authority } = new URL(host.baseUrl);
  const scheme = protocol === "https:" ? "wss:" : "ws:";
  return { webSocketUrl: `${scheme}//${authority}`, token: host.token };
}

const REACHABILITY_TIMEOUT_MS = 5_000;

export interface ReachableHostOrigin {
  origin: string;
  session: HostAccessSession;
}

export function findReachableOrigin(options: {
  host: Pick<SavedHost, "hostId" | "baseUrl" | "endpoints" | "token">;
  fetch?: FetchLike;
  timeoutMs?: number;
}): Promise<ReachableHostOrigin | null> {
  const origins = savedHostOrigins(options.host);
  return new Promise((resolve) => {
    let pending = origins.length;
    let settled = false;
    const finishOne = (found: ReachableHostOrigin | null) => {
      pending -= 1;
      if (settled) return;
      if (found) {
        settled = true;
        resolve(found);
      } else if (pending === 0) {
        resolve(null);
      }
    };
    if (pending === 0) resolve(null);
    for (const origin of origins) {
      verifyHostCredential({
        baseUrl: origin,
        token: options.host.token,
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? REACHABILITY_TIMEOUT_MS,
      }).then(
        (session) =>
          finishOne(
            session.host.hostId === options.host.hostId
              ? { origin, session }
              : null,
          ),
        () => finishOne(null),
      );
    }
  });
}
