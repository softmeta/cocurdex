import {
  decodeBase64Url,
  encodeBase64Url,
  generateKeyPair,
  keyPairFromSecretKey,
  type NoiseCrypto,
  pairingSafetyCode,
} from "@cocurdex/secure-channel";
import type {
  HostAccessSession,
  RemoteChannelAccepted,
  RemoteConnectRequest,
  RemotePairRequest,
} from "@cocurdex/shared";
import type { PairedHostEndpoint } from "./platform";
import {
  type SavedHost,
  type SavedHostStore,
  savedHostOrigins,
  uniqueOrigins,
} from "./saved-hosts";
import { openSecureSocket, type SecureSocketHandlers } from "./secure-socket";

export { HostAccessError, type HostAccessFailure } from "./host-access-error";

export interface PairHostOptions {
  baseUrl: string;
  code: string;
  hostKey: string;
  label?: string;
  store: SavedHostStore;
  crypto?: NoiseCrypto;
  timeoutMs?: number;
  now?(): Date;
}

export async function pairHost(options: PairHostOptions): Promise<SavedHost> {
  const deviceKeyPair = generateKeyPair(options.crypto);
  const payload: RemotePairRequest = {
    secret: options.code,
    label: options.label,
  };
  const opened = await openSecureSocket({
    url: options.baseUrl,
    hostKey: options.hostKey,
    deviceKeyPair,
    envelope: { v: 1, mode: "pair" },
    payload,
    crypto: options.crypto,
    timeoutMs: options.timeoutMs,
  });
  opened.close();
  const { accepted } = opened;
  const baseUrl = new URL(options.baseUrl).origin;
  const saved: SavedHost = {
    hostId: accepted.host.hostId,
    name: accepted.host.name,
    baseUrl,
    endpoints: uniqueOrigins([baseUrl, ...(accepted.endpoints ?? [])]),
    deviceId: accepted.deviceId,
    hostKey: options.hostKey,
    deviceSecretKey: encodeBase64Url(deviceKeyPair.secretKey),
    scopes: accepted.scopes,
    pairedAt: (options.now?.() ?? new Date()).toISOString(),
  };
  options.store.save(saved);
  return saved;
}

export function savedHostEndpoint(
  host: Pick<
    SavedHost,
    "baseUrl" | "hostId" | "hostKey" | "deviceId" | "deviceSecretKey"
  >,
): PairedHostEndpoint {
  return {
    kind: "paired",
    baseUrl: host.baseUrl,
    hostId: host.hostId,
    hostKey: host.hostKey,
    deviceId: host.deviceId,
    deviceSecretKey: host.deviceSecretKey,
  };
}

export function connectPairedHost(
  endpoint: PairedHostEndpoint,
  options: {
    crypto?: NoiseCrypto;
    timeoutMs?: number;
    handlers?: SecureSocketHandlers;
  } = {},
) {
  const payload: RemoteConnectRequest = { deviceId: endpoint.deviceId };
  return openSecureSocket({
    url: endpoint.baseUrl,
    hostKey: endpoint.hostKey,
    deviceKeyPair: keyPairFromSecretKey(
      decodeBase64Url(endpoint.deviceSecretKey),
      options.crypto,
    ),
    envelope: { v: 1, mode: "connect", hostId: endpoint.hostId },
    payload,
    crypto: options.crypto,
    timeoutMs: options.timeoutMs,
    handlers: options.handlers,
  });
}

function acceptedSession(accepted: RemoteChannelAccepted): HostAccessSession {
  return {
    host: accepted.host,
    principal: {
      kind: "device",
      deviceId: accepted.deviceId,
      scopes: accepted.scopes,
    },
    endpoints: accepted.endpoints,
  };
}

const REACHABILITY_TIMEOUT_MS = 5_000;
const CURRENT_ORIGIN_GRACE_MS = 1_000;

export interface ReachableHostOrigin {
  origin: string;
  session: HostAccessSession;
}

type ProbeHost = Pick<
  SavedHost,
  | "hostId"
  | "baseUrl"
  | "endpoints"
  | "hostKey"
  | "deviceId"
  | "deviceSecretKey"
>;

interface ProbeOptions {
  crypto?: NoiseCrypto;
  timeoutMs?: number;
}

async function probeOrigin(
  host: ProbeHost,
  origin: string,
  options: ProbeOptions,
): Promise<ReachableHostOrigin | null> {
  try {
    const opened = await connectPairedHost(
      savedHostEndpoint({ ...host, baseUrl: origin }),
      {
        crypto: options.crypto,
        timeoutMs: options.timeoutMs ?? REACHABILITY_TIMEOUT_MS,
      },
    );
    opened.close();
    return opened.accepted.host.hostId === host.hostId
      ? { origin, session: acceptedSession(opened.accepted) }
      : null;
  } catch {
    return null;
  }
}

function firstFound(probes: Promise<ReachableHostOrigin | null>[]) {
  return new Promise<ReachableHostOrigin | null>((resolve) => {
    let pending = probes.length;
    if (pending === 0) resolve(null);
    for (const probe of probes) {
      void probe.then((found) => {
        pending -= 1;
        if (found) resolve(found);
        else if (pending === 0) resolve(null);
      });
    }
  });
}

function withinGrace<T>(promise: Promise<T>, graceMs: number) {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), graceMs)),
  ]);
}

export async function findReachableOrigin(
  options: { host: ProbeHost } & ProbeOptions,
): Promise<ReachableHostOrigin | null> {
  const [current, ...others] = savedHostOrigins(options.host);
  if (current === undefined) return null;
  const currentProbe = probeOrigin(options.host, current, options);
  const otherProbe = firstFound(
    others.map((origin) => probeOrigin(options.host, origin, options)),
  );
  const first = await firstFound([currentProbe, otherProbe]);
  if (!first || first.origin === current) return first;
  return (await withinGrace(currentProbe, CURRENT_ORIGIN_GRACE_MS)) ?? first;
}

export function savedHostSafetyCode(
  host: Pick<SavedHost, "hostKey" | "deviceSecretKey">,
  crypto?: NoiseCrypto,
) {
  const device = keyPairFromSecretKey(
    decodeBase64Url(host.deviceSecretKey),
    crypto,
  );
  return pairingSafetyCode(
    decodeBase64Url(host.hostKey),
    device.publicKey,
    crypto,
  );
}
