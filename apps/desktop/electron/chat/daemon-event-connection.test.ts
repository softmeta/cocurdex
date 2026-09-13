import { subscribeDaemonEvents } from "@cocurdex/daemon/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDaemonEventConnection } from "./daemon-event-connection";

vi.mock("@cocurdex/daemon/client", () => ({ subscribeDaemonEvents: vi.fn() }));
const connections: ReturnType<typeof createDaemonEventConnection>[] = [];
beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  for (const connection of connections.splice(0)) connection.dispose();
  vi.useRealTimers();
});

function fixture() {
  const options = {
    ensure: vi.fn().mockResolvedValue(undefined),
    userDataPath: "/unused",
    onEvent: vi.fn(),
    onConnected: vi.fn(),
    onDisconnect: vi.fn(),
  };
  const close = vi.fn();
  vi.mocked(subscribeDaemonEvents).mockResolvedValue({ close });
  const connection = createDaemonEventConnection(options);
  connections.push(connection);
  return { connection, options, close };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("daemon event connection generations", () => {
  it("merges concurrent connection attempts", async () => {
    const { connection } = fixture();
    const first = connection.connect();
    const second = connection.connect();
    expect(first).toBe(second);
    await first;
    expect(subscribeDaemonEvents).toHaveBeenCalledOnce();
  });
  it("closes a late subscription after disposal", async () => {
    const { connection, options, close } = fixture();
    const pending = deferred<{ close(): void }>();
    vi.mocked(subscribeDaemonEvents).mockReturnValue(pending.promise);
    const connecting = connection.connect();
    await vi.waitFor(() =>
      expect(subscribeDaemonEvents).toHaveBeenCalledOnce(),
    );
    connection.dispose();
    pending.resolve({ close });
    await connecting;
    expect(close).toHaveBeenCalledOnce();
    expect(options.onConnected).not.toHaveBeenCalled();
  });
  it("ignores stale disconnect callbacks after reconnect", async () => {
    const { connection, options } = fixture();
    await connection.connect();
    const previous = vi.mocked(subscribeDaemonEvents).mock.calls[0]?.[1];
    connection.reset();
    const currentClose = vi.fn();
    vi.mocked(subscribeDaemonEvents).mockResolvedValue({ close: currentClose });
    await connection.connect();
    previous?.onDisconnect?.(new Error("late close"));
    expect(options.onDisconnect).not.toHaveBeenCalled();
    expect(currentClose).not.toHaveBeenCalled();
  });
  it("does not replace a new subscription with a late old handshake", async () => {
    const { connection } = fixture();
    const pending = deferred<{ close(): void }>();
    vi.mocked(subscribeDaemonEvents).mockReturnValueOnce(pending.promise);
    const first = connection.connect();
    await vi.waitFor(() =>
      expect(subscribeDaemonEvents).toHaveBeenCalledOnce(),
    );
    connection.reset();
    const currentClose = vi.fn();
    vi.mocked(subscribeDaemonEvents).mockResolvedValue({ close: currentClose });
    await connection.connect();
    const oldClose = vi.fn();
    pending.resolve({ close: oldClose });
    await first;
    expect(oldClose).toHaveBeenCalledOnce();
    expect(currentClose).not.toHaveBeenCalled();
    connection.dispose();
    expect(currentClose).toHaveBeenCalledOnce();
  });
  it("schedules one reconnect for duplicate error and close notifications", async () => {
    vi.useFakeTimers();
    const { connection, options } = fixture();
    await connection.connect();
    const previous = vi.mocked(subscribeDaemonEvents).mock.calls[0]?.[1];
    previous?.onDisconnect?.(new Error("error"));
    previous?.onDisconnect?.(new Error("close"));
    await vi.advanceTimersByTimeAsync(500);
    expect(options.onDisconnect).toHaveBeenCalledOnce();
    expect(subscribeDaemonEvents).toHaveBeenCalledTimes(2);
  });
});
