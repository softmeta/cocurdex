import {
  decodeBase64Url,
  encodeBase64Url,
  generateKeyPair,
  keyPairFromSecretKey,
  type MessageCompressor,
  type NoiseCrypto,
  pairingSafetyCode,
} from "@cocurdex/secure-channel";
import type { RemoteConnectRequest, RemotePairRequest } from "@cocurdex/shared";
import { hostEndpointBase } from "@cocurdex/shared";
import type { PairedHostEndpoint } from "./platform";
import {
  type SavedHost,
  type SavedHostStore,
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
  const baseUrl = hostEndpointBase(options.baseUrl) ?? options.baseUrl;
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

export function connectPairedHost(
  endpoint: PairedHostEndpoint,
  options: {
    crypto?: NoiseCrypto;
    compressor?: MessageCompressor;
    timeoutMs?: number;
    handlers?: SecureSocketHandlers;
  } = {},
) {
  const payload: RemoteConnectRequest = {
    deviceId: endpoint.deviceId,
    ...(options.compressor ? { compression: ["deflate-raw"] } : {}),
  };
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
    compressor: options.compressor,
    timeoutMs: options.timeoutMs,
    handlers: options.handlers,
  });
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
