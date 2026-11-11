import nodeCrypto from "node:crypto";
import { SECURE_CHANNEL_WEBSOCKET_PROTOCOL } from "@cocurdex/secure-channel";
import type { HostRelayError, HostRelayState } from "@cocurdex/shared";
import { Effect, Fiber } from "effect";
import WebSocket, { type RawData } from "ws";
import { daemonNoiseCrypto, type HostKeys } from "./host-key-store";

const RELAY_PROTOCOL_LABEL = "cocurdex-relay/2";
const RELAY_WIRE_PROTOCOL = 2;
const ROUTE_ID_BYTES = 16;
const NONCE_BYTES = 32;
const RELAY_KEY_BYTES = 32;
const CONTROL_FRAME_LIMIT = 8 * 1024;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const LIVENESS_TIMEOUT_MS = 75_000;
const MAX_RETRY_DELAY_MS = 60_000;
const REFUSED_RETRY_DELAY_MS = 5 * 60_000;
const LATENCY_PROBE_INTERVAL_MS = 30_000;
const LATENCY_CHANGE_RATIO = 0.2;
const LATENCY_CHANGE_FLOOR_MS = 5;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const CLOSE_ERRORS: Record<number, HostRelayError> = {
  4400: "protocol",
  4401: "unauthorized",
  4402: "credentialRequired",
  4409: "replaced",
  4429: "rateLimited",
};

const REFUSALS = new Set<HostRelayError>([
  "unauthorized",
  "credentialRequired",
  "outdated",
  "replaced",
]);

export interface RelayTarget {
  url: string;
  credential: string | null;
}

export interface RelayConnectorState {
  state: HostRelayState;
  error: HostRelayError | null;
  latencyMs: number | null;
}

export type RelayLog = (
  level: "info" | "warn",
  event: string,
  details: Record<string, unknown>,
) => void;

export interface RelayController {
  apply(target: RelayTarget | null): void;
  state(): RelayConnectorState;
}

export interface RelayConnectorOptions {
  hostKeys(): HostKeys;
  onDataSocket(socket: WebSocket, remoteAddress: string): void;
  onStateChanged?(): void;
  log?: RelayLog;
  retryDelayMs?(attempt: number, refused: boolean): number;
  latencyProbeIntervalMs?: number;
}

type ControlMessage =
  | {
      type: "challenge";
      nonce: string;
      relayKey: string | null;
      protocol: number | null;
      version: string | null;
    }
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
      return {
        type: "challenge",
        nonce: parsed.nonce,
        relayKey: typeof parsed.relayKey === "string" ? parsed.relayKey : null,
        protocol: typeof parsed.protocol === "number" ? parsed.protocol : null,
        version: typeof parsed.version === "string" ? parsed.version : null,
      };
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

function registration(
  keys: HostKeys,
  nonce: Buffer,
  relayKey: Buffer,
  target: RelayTarget,
) {
  const routeId = routeIdBytes(keys.noisePublicKey);
  const sharedSecret = daemonNoiseCrypto.dh(keys.noise.secretKey, relayKey);
  const payload = Buffer.concat([
    Buffer.from(RELAY_PROTOCOL_LABEL, "utf8"),
    nonce,
    routeId,
    relayKey,
  ]);
  const proof = daemonNoiseCrypto.hmacSha256(sharedSecret, payload);
  return {
    type: "register",
    routeId: routeId.toString("base64url"),
    hostKey: keys.noisePublicKey,
    proof: Buffer.from(proof).toString("base64url"),
    ...(target.credential ? { credential: target.credential } : {}),
  };
}

function latencyChanged(previous: number | null, next: number) {
  if (previous === null) return true;
  const threshold = Math.max(
    LATENCY_CHANGE_FLOOR_MS,
    previous * LATENCY_CHANGE_RATIO,
  );
  return Math.abs(next - previous) >= threshold;
}

function sameTarget(left: RelayTarget | null, right: RelayTarget | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

interface ControlSession {
  socket: WebSocket;
  closed: Promise<HostRelayError>;
  dispose(): void;
}

export function createRelayConnector(options: RelayConnectorOptions) {
  let target: RelayTarget | null = null;
  let status: RelayConnectorState = {
    state: "off",
    error: null,
    latencyMs: null,
  };
  let attempt = 0;
  let supervisor: Fiber.Fiber<unknown, unknown> | null = null;
  const dataSockets = new Set<WebSocket>();
  const retryDelay = options.retryDelayMs ?? defaultRetryDelay;
  const probeInterval =
    options.latencyProbeIntervalMs ?? LATENCY_PROBE_INTERVAL_MS;
  const log: RelayLog = options.log ?? (() => undefined);

  const setStatus = (next: Pick<RelayConnectorState, "state" | "error">) => {
    if (next.state === status.state && next.error === status.error) return;
    status = {
      ...next,
      latencyMs: next.state === "online" ? status.latencyMs : null,
    };
    options.onStateChanged?.();
  };

  const setLatency = (latencyMs: number) => {
    if (status.state !== "online") return;
    if (!latencyChanged(status.latencyMs, latencyMs)) return;
    status = { ...status, latencyMs };
    options.onStateChanged?.();
  };

  const stop = () => {
    const fiber = supervisor;
    supervisor = null;
    if (fiber) Effect.runFork(Fiber.interrupt(fiber));
    for (const socket of dataSockets) socket.terminate();
    dataSockets.clear();
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

  const openControl = (active: RelayTarget): ControlSession => {
    const socket = new WebSocket(relaySocketUrl(active.url, "/v1/host"), {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      maxPayload: CONTROL_FRAME_LIMIT,
    });
    let failure: HostRelayError = "unreachable";
    let liveness: NodeJS.Timeout | null = null;
    let latencyTimer: NodeJS.Timeout | null = null;
    let pingSentAt: number | null = null;
    let registered = false;
    let relayVersion: string | null = null;
    const clearTimers = () => {
      if (liveness) clearTimeout(liveness);
      if (latencyTimer) clearInterval(latencyTimer);
      liveness = null;
      latencyTimer = null;
    };
    const probeLatency = () => {
      if (pingSentAt !== null || socket.readyState !== WebSocket.OPEN) return;
      pingSentAt = performance.now();
      socket.ping();
    };
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
        relayVersion = message.version;
        if ((message.protocol ?? 0) < RELAY_WIRE_PROTOCOL) {
          return fail("outdated");
        }
        const nonce = Buffer.from(message.nonce, "base64url");
        const relayKey = Buffer.from(message.relayKey ?? "", "base64url");
        if (
          nonce.length !== NONCE_BYTES ||
          relayKey.length !== RELAY_KEY_BYTES
        ) {
          return fail("protocol");
        }
        let register: ReturnType<typeof registration>;
        try {
          register = registration(options.hostKeys(), nonce, relayKey, active);
        } catch {
          return fail("protocol");
        }
        socket.send(JSON.stringify(register));
        return;
      }
      if (message.type === "registered") {
        attempt = 0;
        registered = true;
        setStatus({ state: "online", error: null });
        log("info", "relay.online", { url: active.url, relayVersion });
        probeLatency();
        latencyTimer = setInterval(probeLatency, probeInterval);
        latencyTimer.unref?.();
        return;
      }
      if (!TICKET_PATTERN.test(message.ticket)) return fail("protocol");
      acceptSession(active, message.ticket);
    };
    socket.on("open", alive);
    socket.on("ping", alive);
    socket.on("pong", () => {
      if (pingSentAt === null) return;
      const latencyMs = Math.max(1, Math.round(performance.now() - pingSentAt));
      pingSentAt = null;
      setLatency(latencyMs);
    });
    socket.on("error", () => undefined);
    socket.on("message", (data, isBinary) => {
      alive();
      const message = isBinary ? null : parseControlMessage(data);
      if (!message) return fail("protocol");
      handle(message);
    });
    const closed = new Promise<HostRelayError>((resolve) => {
      socket.once("close", (code, reason) => {
        clearTimers();
        const error = CLOSE_ERRORS[code] ?? failure;
        log("warn", "relay.disconnected", {
          url: active.url,
          code,
          reason: reason.toString("utf8"),
          error,
          registered,
          relayVersion,
        });
        resolve(error);
      });
    });
    return {
      socket,
      closed,
      dispose() {
        clearTimers();
        socket.removeAllListeners();
        socket.on("error", () => undefined);
        socket.terminate();
      },
    };
  };

  const connectOnce = (active: RelayTarget) =>
    Effect.scoped(
      Effect.acquireRelease(
        Effect.sync(() => openControl(active)),
        (session) => Effect.sync(() => session.dispose()),
      ).pipe(Effect.flatMap((session) => Effect.promise(() => session.closed))),
    );

  const supervise = (active: RelayTarget) =>
    Effect.gen(function* () {
      for (;;) {
        setStatus({ state: "connecting", error: status.error });
        const error = yield* connectOnce(active);
        setStatus({ state: "offline", error });
        const delay = retryDelay(attempt, REFUSALS.has(error));
        attempt += 1;
        yield* Effect.sleep(delay);
      }
    });

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
      supervisor = Effect.runFork(supervise(next));
    },
    state: () => status,
    close() {
      stop();
      target = null;
      status = { state: "off", error: null, latencyMs: null };
    },
  };
}

export type RelayConnector = ReturnType<typeof createRelayConnector>;
