import {
  createDaemonRpcClient,
  type DaemonTransport,
  type DaemonTransportHandlers,
} from "@cocurdex/rpc/internal/client";
import { createSharedTransport } from "@cocurdex/rpc/internal/shared-transport";
import { describe, expect, it, vi } from "vitest";

function fakeSocket() {
  const opened: {
    handlers: DaemonTransportHandlers;
    sent: string[];
    close: ReturnType<typeof vi.fn>;
  }[] = [];
  const open: DaemonTransport = (handlers) => {
    const socket = { handlers, sent: [] as string[], close: vi.fn() };
    opened.push(socket);
    return {
      send: (message) => socket.sent.push(message),
      close: socket.close,
    };
  };
  const reply = (index: number, result: unknown) => {
    const socket = opened[index];
    if (!socket) throw new Error("socket not opened");
    for (const message of socket.sent.splice(0)) {
      const { id } = JSON.parse(message) as { id: string };
      socket.handlers.onMessage(JSON.stringify({ id, result }));
    }
  };
  return { open, opened, reply };
}

describe("shared daemon transport", () => {
  it("multiplexes concurrent requests over one connection and keeps it open", async () => {
    const socket = fakeSocket();
    const client = createDaemonRpcClient(
      createSharedTransport(socket.open),
      "t",
    );
    const first = client.request("daemon.status", undefined);
    const second = client.request("daemon.status", undefined);
    expect(socket.opened).toHaveLength(1);
    expect(socket.opened[0]?.sent).toHaveLength(2);

    socket.reply(0, { pid: 1 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { pid: 1 },
      { pid: 1 },
    ]);
    expect(socket.opened[0]?.close).not.toHaveBeenCalled();

    const third = client.request("daemon.status", undefined);
    socket.reply(0, { pid: 2 });
    await expect(third).resolves.toEqual({ pid: 2 });
    expect(socket.opened).toHaveLength(1);
  });

  it("fails pending requests when the connection drops and reconnects on demand", async () => {
    const socket = fakeSocket();
    const client = createDaemonRpcClient(
      createSharedTransport(socket.open),
      "t",
    );
    const pending = client.request("daemon.status", undefined);
    socket.opened[0]?.handlers.onClose();
    await expect(pending).rejects.toMatchObject({ code: "DISCONNECTED" });

    const retried = client.request("daemon.status", undefined);
    expect(socket.opened).toHaveLength(2);
    socket.reply(1, { pid: 3 });
    await expect(retried).resolves.toEqual({ pid: 3 });
  });

  it("closes a connection that errors and fails its requests", async () => {
    const socket = fakeSocket();
    const client = createDaemonRpcClient(
      createSharedTransport(socket.open),
      "t",
    );
    const pending = client.request("daemon.status", undefined);
    socket.opened[0]?.handlers.onError(new Error("boom"));
    await expect(pending).rejects.toThrow("boom");
    expect(socket.opened[0]?.close).toHaveBeenCalledOnce();
  });
});
