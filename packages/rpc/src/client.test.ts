import { describe, expect, it, vi } from "vitest";
import {
  createDaemonRpcClient,
  type DaemonTransport,
  type DaemonTransportHandlers,
} from "./client";

function memoryTransport(
  respond: (request: { id: string }, handlers: DaemonTransportHandlers) => void,
) {
  const closed = vi.fn();
  const transport: DaemonTransport = (handlers) => ({
    send: (message) => respond(JSON.parse(message), handlers),
    close: closed,
  });
  return { transport, closed };
}

describe("daemon rpc client over an arbitrary transport", () => {
  it("resolves the matching response and closes the connection", async () => {
    const { transport, closed } = memoryTransport((request, handlers) => {
      handlers.onMessage(JSON.stringify({ id: "other", result: "wrong" }));
      handlers.onMessage(
        JSON.stringify({ id: request.id, result: { pid: 1 } }),
      );
    });
    const client = createDaemonRpcClient(transport, "token");
    await expect(client.request("daemon.status", undefined)).resolves.toEqual({
      pid: 1,
    });
    expect(closed).toHaveBeenCalledOnce();
  });
  it("sends the token and omits params for parameterless methods", async () => {
    let sent: Record<string, unknown> = {};
    const { transport } = memoryTransport((request, handlers) => {
      sent = request;
      handlers.onMessage(JSON.stringify({ id: request.id, result: null }));
    });
    await createDaemonRpcClient(transport, "secret").request(
      "daemon.status",
      undefined,
    );
    expect(sent).toEqual({
      id: expect.any(String),
      method: "daemon.status",
      token: "secret",
    });
  });
  it("rejects malformed messages, server errors, close and timeout", async () => {
    const client = (respond: Parameters<typeof memoryTransport>[0]) =>
      createDaemonRpcClient(memoryTransport(respond).transport, "t");
    await expect(
      client((_, h) => h.onMessage("[]")).request("daemon.status", undefined),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      client((r, h) =>
        h.onMessage(
          JSON.stringify({
            id: r.id,
            error: { code: "UNAUTHORIZED", message: "no" },
          }),
        ),
      ).request("daemon.status", undefined),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "no" });
    await expect(
      client((_, h) => h.onClose()).request("daemon.status", undefined),
    ).rejects.toMatchObject({ code: "DISCONNECTED" });
    await expect(
      client(() => {}).request("daemon.status", undefined, { timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
  it("buffers pre-acknowledgement events and delivers them in order", async () => {
    let handlers: DaemonTransportHandlers | undefined;
    const { transport, closed } = memoryTransport((request, h) => {
      handlers = h;
      h.onMessage(
        JSON.stringify({
          type: "daemon.event",
          seq: 2,
          event: { type: "early" },
        }),
      );
      h.onMessage(JSON.stringify({ id: request.id, result: null }));
    });
    const onEvent = vi.fn();
    const onDisconnect = vi.fn();
    const subscription = await createDaemonRpcClient(transport, "t").subscribe(
      onEvent,
      { afterSeq: 1, onDisconnect },
    );
    handlers?.onMessage(
      JSON.stringify({
        type: "daemon.event",
        seq: 3,
        event: { type: "late" },
      }),
    );
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "early",
      "late",
    ]);
    expect(subscription.lastSeq).toBe(3);
    subscription.close();
    expect(closed).toHaveBeenCalledOnce();
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
