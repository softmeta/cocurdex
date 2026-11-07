import type { MessageCompressor, NoiseCrypto } from "@cocurdex/secure-channel";
import { isRelayEndpoint } from "@cocurdex/shared";
import { connectPairedHost } from "./host-access";
import { HostAccessError } from "./host-access-error";
import {
  type SavedHost,
  savedHostEndpoint,
  savedHostOrigins,
} from "./saved-hosts";
import type { OpenSecureSocket, SecureSocketHandlers } from "./secure-socket";

const DIRECT_PROBE_TIMEOUT_MS = 5_000;
const CURRENT_ORIGIN_GRACE_MS = 1_000;

type ReachableHost = Pick<
  SavedHost,
  | "hostId"
  | "baseUrl"
  | "endpoints"
  | "hostKey"
  | "deviceId"
  | "deviceSecretKey"
>;

export interface ConnectedOrigin {
  origin: string;
  opened: OpenSecureSocket;
}

interface OpenOriginOptions {
  crypto?: NoiseCrypto;
  compressor?: MessageCompressor;
  timeoutMs?: number;
  handlers?: SecureSocketHandlers;
}

const HOST_ANSWERS: readonly HostAccessError["reason"][] = [
  "pending",
  "invalid",
];

function hostAnswer(errors: readonly unknown[]) {
  for (const reason of HOST_ANSWERS) {
    const answer = errors.find(
      (error) => error instanceof HostAccessError && error.reason === reason,
    );
    if (answer) return answer;
  }
  return null;
}

async function openOrigin(
  host: ReachableHost,
  origin: string,
  options: OpenOriginOptions,
  errors: unknown[] = [],
): Promise<ConnectedOrigin | null> {
  try {
    const opened = await connectPairedHost(
      savedHostEndpoint({ ...host, baseUrl: origin }),
      options,
    );
    if (opened.accepted.host.hostId === host.hostId) return { origin, opened };
    opened.close();
    return null;
  } catch (error) {
    errors.push(error);
    return null;
  }
}

function firstFound<T>(attempts: Promise<T | null>[]) {
  return new Promise<T | null>((resolve) => {
    let pending = attempts.length;
    if (pending === 0) resolve(null);
    for (const attempt of attempts) {
      void attempt.then((found) => {
        pending -= 1;
        if (found) resolve(found);
        else if (pending === 0) resolve(null);
      });
    }
  });
}

function withinGrace<T>(promise: Promise<T>, graceMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), graceMs);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

function gatedHandlers(
  handlers: SecureSocketHandlers | undefined,
  isChosen: () => boolean,
  onEarlyClose: () => void,
): SecureSocketHandlers | undefined {
  if (!handlers) return undefined;
  return {
    onMessage(message) {
      if (isChosen()) handlers.onMessage(message);
    },
    onStream(stream, header) {
      if (isChosen() && handlers.onStream) handlers.onStream(stream, header);
      else stream.reset("unsupported");
    },
    onClose() {
      if (isChosen()) handlers.onClose();
      else onEarlyClose();
    },
  };
}

export interface ConnectReachableOriginOptions extends OpenOriginOptions {
  host: ReachableHost;
  onDirectFound?(origin: string): void;
}

export async function connectReachableOrigin(
  options: ConnectReachableOriginOptions,
): Promise<ConnectedOrigin | null> {
  const origins = savedHostOrigins(options.host);
  const [current] = origins;
  if (current === undefined) return null;
  let chosen: string | null = null;
  const closedEarly = new Set<string>();
  const errors: unknown[] = [];
  const attempts = new Map(
    origins.map((origin) => [
      origin,
      openOrigin(
        options.host,
        origin,
        {
          ...options,
          handlers: gatedHandlers(
            options.handlers,
            () => chosen === origin,
            () => closedEarly.add(origin),
          ),
        },
        errors,
      ),
    ]),
  );
  const attemptsOf = (relayed: boolean) =>
    origins
      .filter((origin) => isRelayEndpoint(origin) === relayed)
      .map((origin) => attempts.get(origin) ?? Promise.resolve(null));
  const firstDirect = firstFound(attemptsOf(false));
  const first = await firstFound([firstDirect, firstFound(attemptsOf(true))]);
  const currentAttempt = attempts.get(current);
  const keepCurrent =
    first !== null &&
    !isRelayEndpoint(first.origin) &&
    first.origin !== current &&
    !isRelayEndpoint(current) &&
    currentAttempt !== undefined;
  const winner = keepCurrent
    ? ((await withinGrace(currentAttempt, CURRENT_ORIGIN_GRACE_MS)) ?? first)
    : first;
  if (!winner) {
    const answer = hostAnswer(errors);
    if (answer) throw answer;
  }
  chosen = winner?.origin ?? null;
  const relayed = chosen !== null && isRelayEndpoint(chosen);
  for (const [origin, attempt] of attempts) {
    if (origin === chosen) continue;
    void attempt.then((found) => {
      if (!found) return;
      found.opened.close();
      if (relayed && !isRelayEndpoint(origin)) options.onDirectFound?.(origin);
    });
  }
  if (winner && closedEarly.has(winner.origin)) {
    queueMicrotask(() => options.handlers?.onClose());
  }
  return winner;
}

export async function findDirectOrigin(options: {
  host: ReachableHost;
  crypto?: NoiseCrypto;
  timeoutMs?: number;
}): Promise<string | null> {
  const direct = savedHostOrigins(options.host).filter(
    (origin) => !isRelayEndpoint(origin),
  );
  const found = await firstFound(
    direct.map((origin) =>
      openOrigin(options.host, origin, {
        crypto: options.crypto,
        timeoutMs: options.timeoutMs ?? DIRECT_PROBE_TIMEOUT_MS,
      }).then((connected) => {
        connected?.opened.close();
        return connected;
      }),
    ),
  );
  return found?.origin ?? null;
}
