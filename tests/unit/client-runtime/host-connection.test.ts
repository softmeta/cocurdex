import {
  createHostConnection,
  type HostConnection,
} from "@cocurdex/client-runtime/internal/host-connection";
import type { HostPlatform } from "@cocurdex/client-runtime/internal/platform";
import { createHostRegistry } from "@cocurdex/client-runtime/internal/registry";
import type { DaemonTransport } from "@cocurdex/rpc/client";
import { afterEach, describe, expect, it, vi } from "vitest";

interface WireRequest {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  idempotencyKey?: string;
}

type Reply = (
  request: WireRequest,
  respond: (message: Record<string, unknown>) => void,
  drop: () => void,
) => void;

function fakeDaemon(reply: Reply) {
  const requests: WireRequest[] = [];
  const transport: DaemonTransport = (handlers) => {
    let open = true;
    return {
      send(text) {
        const request = JSON.parse(text) as WireRequest;
        requests.push(request);
        queueMicrotask(() =>
          reply(
            request,
            (message) => {
              if (open) handlers.onMessage(JSON.stringify(message));
            },
            () => {
              open = false;
              handlers.onClose();
            },
          ),
        );
      },
      close() {
        open = false;
      },
    };
  };
  const platform: HostPlatform = {
    resolveEndpoint: async () => ({
      webSocketUrl: "ws://127.0.0.1:1",
      token: "token",
    }),
    openTransport: () => transport,
  };
  return { platform, requests };
}

const hosts: HostConnection[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
});

function host(platform: HostPlatform) {
  const connection = createHostConnection({
    hostId: "local",
    platform,
    supervisor: { backoff: { baseMs: 1, random: () => 1 } },
  });
  hosts.push(connection);
  return connection;
}

const subscribed = { epoch: "epoch-1", replayGap: false };

describe("host connection", () => {
  it("delivers daemon events to listeners and reports a live state", async () => {
    const { platform } = fakeDaemon((request, respond) => {
      if (request.method !== "daemon.subscribe") return;
      respond({ id: request.id, result: subscribed });
      respond({
        type: "daemon.event",
        seq: 3,
        event: { type: "data.changed", areas: ["notes"] },
      });
    });
    const connection = host(platform);
    const events: unknown[] = [];
    connection.onEvent((event, meta) => events.push({ event, meta }));
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toEqual({
      event: { type: "data.changed", areas: ["notes"] },
      meta: { epoch: "epoch-1", seq: 3 },
    });
    expect(connection.getState()).toMatchObject({
      status: "live",
      lastSeq: 3,
    });
  });

  it("resends an unconfirmed command with the same idempotency key", async () => {
    let dropped = false;
    const { platform, requests } = fakeDaemon((request, respond, drop) => {
      if (request.method === "daemon.subscribe") {
        respond({ id: request.id, result: subscribed });
        return;
      }
      if (!dropped) {
        dropped = true;
        drop();
        return;
      }
      respond({ id: request.id, result: { id: "message-1" } });
    });
    const connection = host(platform);
    const result = await connection.command(
      "session.send",
      {
        sessionId: "s-1",
        messageId: "message-1",
        content: "hi",
      } as never,
      { idempotencyKey: "message-1" },
    );
    expect(result).toEqual({ id: "message-1" });
    const sends = requests.filter(
      (request) => request.method === "session.send",
    );
    expect(sends).toHaveLength(2);
    expect(sends.map((request) => request.idempotencyKey)).toEqual([
      "message-1",
      "message-1",
    ]);
    expect(sends[0]?.id).not.toBe(sends[1]?.id);
  });

  it("waits for an unavailable host before sending a command", async () => {
    const { platform, requests } = fakeDaemon((request, respond) => {
      respond({
        id: request.id,
        result: request.method === "daemon.subscribe" ? subscribed : "ok",
      });
    });
    let unavailable = 2;
    const resolveEndpoint = platform.resolveEndpoint;
    const connection = host({
      ...platform,
      resolveEndpoint: async () => {
        if (unavailable > 0) {
          unavailable -= 1;
          throw new Error("daemon.json not found");
        }
        return resolveEndpoint();
      },
    });
    await expect(
      connection.command("note.list", undefined as never, {
        idempotencyKey: "list",
      }),
    ).resolves.toBe("ok");
    expect(
      requests.filter((request) => request.method === "note.list"),
    ).toHaveLength(1);
  });

  it("does not resend a command the daemon rejected", async () => {
    const { platform, requests } = fakeDaemon((request, respond) => {
      respond({
        id: request.id,
        error: { code: "REQUEST_FAILED", message: "Session not found" },
      });
    });
    const connection = host(platform);
    await expect(
      connection.command("session.send", {} as never, {
        idempotencyKey: "message-1",
      }),
    ).rejects.toThrow("Session not found");
    expect(requests).toHaveLength(1);
  });

  it("gives up after the configured attempts", async () => {
    const { platform, requests } = fakeDaemon((request, respond, drop) => {
      if (request.method === "daemon.subscribe") {
        respond({ id: request.id, result: subscribed });
        return;
      }
      drop();
    });
    const connection = host(platform);
    await expect(
      connection.command("session.send", {} as never, {
        idempotencyKey: "message-1",
        maxAttempts: 2,
      }),
    ).rejects.toMatchObject({ code: "DISCONNECTED" });
    expect(
      requests.filter((request) => request.method === "session.send"),
    ).toHaveLength(2);
  });
});

describe("host registry", () => {
  it("keeps one connection per host and notifies when a host is removed", () => {
    const { platform } = fakeDaemon(() => {});
    const registry = createHostRegistry();
    const first = registry.register({ hostId: "local", platform });
    expect(registry.register({ hostId: "local", platform })).toBe(first);
    const other = registry.register({ hostId: "remote", platform });
    expect(registry.list()).toEqual([first, other]);

    const removed: string[] = [];
    registry.onHostRemoved((hostId) => removed.push(hostId));
    expect(registry.remove("local")).toBe(true);
    expect(registry.remove("local")).toBe(false);
    expect(removed).toEqual(["local"]);
    expect(first.getState().status).toBe("disposed");
    expect(registry.get("local")).toBeNull();
    expect(other.getState().status).toBe("idle");
    other.dispose();
  });
});
