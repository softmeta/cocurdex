import nodeCrypto from "node:crypto";
import { SECURE_CHANNEL_WEBSOCKET_PROTOCOL } from "@cocurdex/secure-channel";
import type {
  HostRelayError,
  HostRelayState,
  RelayCredential,
} from "@cocurdex/shared";
import WebSocket, { type RawData } from "ws";
import type { HostKeys } from "./host-key-store";

const RELAY_PROTOCOL_LABEL = "cocurdex-relay/1";
const ROUTE_ID_BYTES = 16;
const NONCE_BYTES = 32;
const CONTROL_FRAME_LIMIT = 8 * 1024;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const LIVENESS_TIMEOUT_MS = 75_000;
const MAX_RETRY_DELAY_MS = 60_000;
const REFUSED_RETRY_DELAY_MS = 5 * 60_000;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const CLOSE_ERRORS: Record<number, HostRelayError> = {
  4400: "protocol",
  4401: "unauthorized",
  4402: "credentialRequired",
  4403: "routeTaken",
  4429: "rateLimited",
};

const REFUSALS = new Set<HostRelayError>([
  "unauthorized",
  "credentialRequired",
  "routeTaken",
]);

export interface RelayTarget {
  url: string;
  credential: RelayCredential | null;
}

export interface RelayConnectorState {
  state: HostRelayState;
  error: HostRelayError | null;
}

export interface RelayController {
  apply(target: RelayTarget | null): void;
  state(): RelayConnectorState;
}

export interface RelayConnectorOptions {
  hostKeys(): HostKeys;
  onDataSocket(socket: WebSocket, remoteAddress: string): void;
  onStateChanged?(): void;
  retryDelayMs?(attempt: number, refused: boolean): number;
}

type ControlMessage =
  | { type: "challenge"; nonce: string }
  | { type: "registered"; routeId: string }
  | { type: "incoming"; ticket: string };

function routeIdBytes(hostKey: string) {
  return nodeCrypto
    .createHash("sha256")
    .update(Buffer.from(hostKey, "base64url"))
    .digest()
    .subarray(0, ROUTE_ID_BYTES);
}

export function relayRouteId(hostKey: string) {
  return routeIdBytes(hostKey).toString("base64url");
}

function relaySocketUrl(relayUrl: string, path: string) {
  const url = new URL(`${relayUrl}${path}`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function defaultRetryDelay(attempt: number, refused: boolean) {
  if (refused) return REFUSED_RETRY_DELAY_MS;
  const ceiling = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
  return ceiling / 2 + (Math.random() * ceiling) / 2;
}

function parseControlMessage(data: RawData): ControlMessage | null {
  try {
    const parsed = JSON.parse(String(data)) as Record<string, unknown>;
    if (parsed.type === "challenge" && typeof parsed.nonce === "string") {
      return { type: "challenge", nonce: parsed.nonce };
    }
    if (parsed.type === "registered" && typeof parsed.routeId === "string") {
      return { type: "registered", routeId: parsed.routeId };
    }
    if (parsed.type === "incoming" && typeof parsed.ticket === "string") {
      return { type: "incoming", ticket: parsed.ticket };
    }
    return null;
  } catch {
    return null;
  }
}

function registration(keys: HostKeys, nonce: Buffer, target: RelayTarget) {
  const routeId = routeIdBytes(keys.noisePublicKey);
  const payload = Buffer.concat([
    Buffer.from(RELAY_PROTOCOL_LABEL, "utf8"),
    nonce,
    routeId,
  ]);
  const signingKey = nodeCrypto
    .createPublicKey(keys.signingPrivateKey)
    .export({ format: "jwk" }).x;
  return {
    type: "register",
    routeId: routeId.toString("base64url"),
    hostKey: keys.noisePublicKey,
    signingKey,
    signature: nodeCrypto
      .sign(null, payload, keys.signingPrivateKey)
      .toString("base64url"),
    ...(target.credential ? { credential: target.credential } : {}),
  };
}

function sameTarget(left: RelayTarget | null, right: RelayTarget | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createRelayConnector(options: RelayConnectorOptions) {
  let target: RelayTarget | null = null;
  let status: RelayConnectorState = { state: "off", error: null };
  let generation = 0;
  let attempt = 0;
  let control: WebSocket | null = null;
  let retryTimer: NodeJS.Timeout | null = null;
  const dataSockets = new Set<WebSocket>();
  const retryDelay = options.retryDelayMs ?? defaultRetryDelay;

  const setStatus = (next: RelayConnectorState) => {
    if (next.state === status.state && next.error === status.error) return;
    status = next;
    options.onStateChanged?.();
  };

  const stop = () => {
    generation += 1;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    control?.terminate();
    control = null;
    for (const socket of dataSockets) socket.terminate();
    dataSockets.clear();
  };

  const scheduleRetry = (round: number, error: HostRelayError) => {
    if (round !== generation) return;
    setStatus({ state: "offline", error });
    const delay = retryDelay(attempt, REFUSALS.has(error));
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect(round);
    }, delay);
    retryTimer.unref?.();
  };

  const acceptSession = (active: RelayTarget, ticket: string) => {
    const socket = new WebSocket(
      relaySocketUrl(active.url, `/v1/host/accept/${ticket}`),
      [SECURE_CHANNEL_WEBSOCKET_PROTOCOL],
      { handshakeTimeout: HANDSHAKE_TIMEOUT_MS },
    );
    dataSockets.add(socket);
    socket.on("error", () => undefined);
    socket.once("close", () => dataSockets.delete(socket));
    socket.once("open", () =>
      options.onDataSocket(socket, `relay:${new URL(active.url).host}`),
    );
  };

  const connect = (round: number) => {
    const active = target;
    if (round !== generation || !active) return;
    setStatus({ state: "connecting", error: status.error });
    const socket = new WebSocket(relaySocketUrl(active.url, "/v1/host"), {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      maxPayload: CONTROL_FRAME_LIMIT,
    });
    control = socket;
    let failure: HostRelayError = "unreachable";
    let liveness: NodeJS.Timeout | null = null;
    const alive = () => {
      if (liveness) clearTimeout(liveness);
      liveness = setTimeout(() => socket.terminate(), LIVENESS_TIMEOUT_MS);
      liveness.unref?.();
    };
    const fail = (error: HostRelayError) => {
      failure = error;
      socket.terminate();
    };
    const handle = (message: ControlMessage) => {
      if (message.type === "challenge") {
        const nonce = Buffer.from(message.nonce, "base64url");
        if (nonce.length !== NONCE_BYTES) return fail("protocol");
        socket.send(
          JSON.stringify(registration(options.hostKeys(), nonce, active)),
        );
        return;
      }
      if (message.type === "registered") {
        attempt = 0;
        setStatus({ state: "online", error: null });
        return;
      }
      if (!TICKET_PATTERN.test(message.ticket)) return fail("protocol");
      acceptSession(active, message.ticket);
    };
    socket.on("open", alive);
    socket.on("ping", alive);
    socket.on("error", () => undefined);
    socket.on("message", (data, isBinary) => {
      if (round !== generation) return;
      alive();
      const message = isBinary ? null : parseControlMessage(data);
      if (!message) return fail("protocol");
      handle(message);
    });
    socket.once("close", (code) => {
      if (liveness) clearTimeout(liveness);
      if (control === socket) control = null;
      scheduleRetry(round, CLOSE_ERRORS[code] ?? failure);
    });
  };

  return {
    apply(next: RelayTarget | null) {
      if (sameTarget(target, next)) return;
      stop();
      target = next;
      attempt = 0;
      if (!next) {
        setStatus({ state: "off", error: null });
        return;
      }
      setStatus({ state: "connecting", error: null });
      connect(generation);
    },
    state: () => status,
    close() {
      stop();
      target = null;
      status = { state: "off", error: null };
    },
  };
}

export type RelayConnector = ReturnType<typeof createRelayConnector>;
