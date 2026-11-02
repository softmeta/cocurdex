import type {
  HostTrafficDirection,
  HostTrafficFrames,
  HostTrafficMessages,
  HostTrafficReport,
  HostTrafficTransport,
} from "@cocurdex/shared";

const RELAY_ADDRESS_PREFIX = "relay:";
const UNKNOWN_CATEGORY = "other";

export interface TrafficMeter {
  recordMessage(
    transport: HostTrafficTransport,
    direction: HostTrafficDirection,
    category: string,
    bytes: number,
  ): void;
  recordFrame(
    transport: HostTrafficTransport,
    direction: HostTrafficDirection,
    bytes: number,
  ): void;
  report(): HostTrafficReport;
  reset(): HostTrafficReport;
}

export function trafficTransport(
  remoteAddress: string | null,
): HostTrafficTransport {
  return remoteAddress?.startsWith(RELAY_ADDRESS_PREFIX) ? "relay" : "direct";
}

function field(message: unknown, name: string): unknown {
  if (typeof message !== "object" || message === null) return undefined;
  return (message as Record<string, unknown>)[name];
}

export function incomingTrafficCategory(
  message: unknown,
  pendingMethods: Map<unknown, string>,
) {
  const method = field(message, "method");
  if (typeof method !== "string") return UNKNOWN_CATEGORY;
  const id = field(message, "id");
  if (id !== undefined) pendingMethods.set(id, method);
  return `rpc:${method}`;
}

export function outgoingTrafficCategory(
  message: unknown,
  pendingMethods: Map<unknown, string>,
) {
  if (field(message, "type") === "daemon.event") {
    const eventType = field(field(message, "event"), "type");
    return typeof eventType === "string"
      ? `event:${eventType}`
      : UNKNOWN_CATEGORY;
  }
  const id = field(message, "id");
  const method = pendingMethods.get(id);
  if (method === undefined) return UNKNOWN_CATEGORY;
  if (field(message, "result") !== undefined || field(message, "error")) {
    pendingMethods.delete(id);
  }
  return `rpc:${method}`;
}

function bySizeDescending<T extends { bytes: number }>(left: T, right: T) {
  return right.bytes - left.bytes;
}

export function createTrafficMeter(now: () => Date = () => new Date()) {
  let since = now();
  let messages = new Map<string, HostTrafficMessages>();
  let frames = new Map<string, HostTrafficFrames>();

  const report = (): HostTrafficReport => ({
    since: since.toISOString(),
    frames: [...frames.values()].map((entry) => ({ ...entry })),
    messages: [...messages.values()]
      .map((entry) => ({ ...entry }))
      .sort(bySizeDescending),
  });

  const meter: TrafficMeter = {
    recordMessage(transport, direction, category, bytes) {
      const key = `${transport}\u0000${direction}\u0000${category}`;
      const entry = messages.get(key) ?? {
        transport,
        direction,
        category,
        messages: 0,
        bytes: 0,
      };
      messages.set(key, {
        ...entry,
        messages: entry.messages + 1,
        bytes: entry.bytes + bytes,
      });
    },
    recordFrame(transport, direction, bytes) {
      const key = `${transport}\u0000${direction}`;
      const entry = frames.get(key) ?? {
        transport,
        direction,
        frames: 0,
        bytes: 0,
      };
      frames.set(key, {
        ...entry,
        frames: entry.frames + 1,
        bytes: entry.bytes + bytes,
      });
    },
    report,
    reset() {
      const final = report();
      since = now();
      messages = new Map();
      frames = new Map();
      return final;
    },
  };
  return meter;
}
