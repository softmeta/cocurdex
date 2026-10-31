import type { NetworkSignal } from "@cocurdex/client-runtime/internal/platform";
import {
  type ConnectionSupervisorOptions,
  createConnectionSupervisor,
  type DaemonEventSubscriber,
} from "@cocurdex/client-runtime/internal/supervisor";
import type { DaemonEventSubscription } from "@cocurdex/rpc/client";
import { DaemonClientError } from "@cocurdex/rpc/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subscribe = vi.fn<DaemonEventSubscriber>();
const supervisors: ReturnType<typeof createConnectionSupervisor>[] = [];

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  for (const supervisor of supervisors.splice(0)) supervisor.dispose();
  vi.useRealTimers();
});

function subscription(
  overrides: Partial<DaemonEventSubscription> = {},
): DaemonEventSubscription {
  return {
    close: vi.fn(),
    epoch: null,
    lastSeq: null,
    replayGap: false,
    ...overrides,
  };
}

function fixture(overrides: Partial<ConnectionSupervisorOptions> = {}) {
  const options = {
    subscribe,
    ensure: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn(),
    onConnected: vi.fn(),
    onDisconnect: vi.fn(),
    backoff: { random: () => 1 },
    ...overrides,
  };
  const close = vi.fn();
  subscribe.mockResolvedValue(subscription({ close }));
  const supervisor = createConnectionSupervisor(options);
  supervisors.push(supervisor);
  return { supervisor, options, close };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function lastDisconnect() {
  return subscribe.mock.calls.at(-1)?.[1].onDisconnect;
}

function networkSignal(online: boolean) {
  const listeners = new Set<(online: boolean) => void>();
  const signal: NetworkSignal & { set(value: boolean): void } = {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(value) {
      online = value;
      for (const listener of listeners) listener(value);
    },
  };
  return signal;
}

describe("connection supervisor generations", () => {
  it("merges concurrent connection attempts", async () => {
    const { supervisor } = fixture();
    const first = supervisor.connect();
    const second = supervisor.connect();
    expect(first).toBe(second);
    await first;
    expect(subscribe).toHaveBeenCalledOnce();
    expect(supervisor.getState().status).toBe("live");
  });

  it("closes a late subscription after disposal", async () => {
    const { supervisor, options, close } = fixture();
    const pending = deferred<DaemonEventSubscription>();
    subscribe.mockReturnValue(pending.promise);
    const connecting = supervisor.connect();
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    supervisor.dispose();
    pending.resolve(subscription({ close }));
    await connecting;
    expect(close).toHaveBeenCalledOnce();
    expect(options.onConnected).not.toHaveBeenCalled();
  });

  it("ignores stale disconnect callbacks after reconnect", async () => {
    const { supervisor, options } = fixture();
    await supervisor.connect();
    const previous = lastDisconnect();
    supervisor.reset();
    const currentClose = vi.fn();
    subscribe.mockResolvedValue(subscription({ close: currentClose }));
    await supervisor.connect();
    previous?.(new Error("late close"));
    expect(options.onDisconnect).not.toHaveBeenCalled();
    expect(currentClose).not.toHaveBeenCalled();
  });

  it("does not replace a new subscription with a late old handshake", async () => {
    const { supervisor } = fixture();
    const pending = deferred<DaemonEventSubscription>();
    subscribe.mockReturnValueOnce(pending.promise);
    const first = supervisor.connect();
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
    supervisor.reset();
    const currentClose = vi.fn();
    subscribe.mockResolvedValue(subscription({ close: currentClose }));
    await supervisor.connect();
    const oldClose = vi.fn();
    pending.resolve(subscription({ close: oldClose }));
    await first;
    expect(oldClose).toHaveBeenCalledOnce();
    expect(currentClose).not.toHaveBeenCalled();
    supervisor.dispose();
    expect(currentClose).toHaveBeenCalledOnce();
  });

  it("resumes from the last position after an explicit reset", async () => {
    const { supervisor } = fixture();
    subscribe.mockResolvedValue(
      subscription({ epoch: "daemon-epoch-a", lastSeq: 20 }),
    );
    await supervisor.connect();
    supervisor.reset();
    await supervisor.connect();
    expect(subscribe.mock.calls[1]?.[1]).toMatchObject({
      afterSeq: 20,
      epoch: "daemon-epoch-a",
    });
  });

  it("asks clients to resync every area after a replay gap", async () => {
    const { supervisor, options } = fixture();
    subscribe.mockResolvedValue(subscription({ replayGap: true }));
    await supervisor.connect();
    expect(options.onEvent).toHaveBeenCalledWith({
      type: "data.changed",
      areas: expect.arrayContaining(["notes", "agent"]),
    });
  });
});

describe("connection supervisor retries", () => {
  it("schedules one retry for duplicate error and close notifications", async () => {
    vi.useFakeTimers();
    const { supervisor, options } = fixture();
    await supervisor.connect();
    const previous = lastDisconnect();
    previous?.(new Error("error"));
    previous?.(new Error("close"));
    expect(supervisor.getState()).toMatchObject({
      status: "retrying",
      failures: 1,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(options.onDisconnect).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("backs off exponentially and keeps failures until the connection is stable", async () => {
    vi.useFakeTimers();
    const { supervisor } = fixture({ stableAfterMs: 1000 });
    subscribe
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockRejectedValueOnce(new Error("unavailable"));
    await supervisor.connect();
    await vi.advanceTimersByTimeAsync(500);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(subscribe).toHaveBeenCalledTimes(3);
    expect(supervisor.getState()).toMatchObject({
      status: "live",
      failures: 2,
    });

    lastDisconnect()?.(new Error("flapped"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(subscribe).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(subscribe).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(1000);
    expect(supervisor.getState().failures).toBe(0);
    lastDisconnect()?.(new Error("close"));
    await vi.advanceTimersByTimeAsync(500);
    expect(subscribe).toHaveBeenCalledTimes(5);
  });

  it("waits for the network instead of retrying while offline", async () => {
    vi.useFakeTimers();
    const network = networkSignal(false);
    const { supervisor } = fixture({ signals: { network } });
    subscribe.mockRejectedValueOnce(new Error("unreachable"));
    await supervisor.connect();
    expect(supervisor.getState()).toMatchObject({
      status: "waiting",
      waitReason: "offline",
      retryAt: null,
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(subscribe).toHaveBeenCalledOnce();

    network.set(true);
    await vi.waitFor(() => expect(supervisor.getState().status).toBe("live"));
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("waits for a wakeup after an authentication failure", async () => {
    vi.useFakeTimers();
    const { supervisor } = fixture();
    subscribe.mockRejectedValueOnce(
      new DaemonClientError("Invalid daemon token", "UNAUTHORIZED"),
    );
    await supervisor.connect();
    expect(supervisor.getState()).toMatchObject({
      status: "waiting",
      waitReason: "unauthorized",
    });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(subscribe).toHaveBeenCalledOnce();

    supervisor.wake();
    await vi.waitFor(() => expect(supervisor.getState().status).toBe("live"));
  });

  it("wakes a pending retry immediately on foreground", async () => {
    vi.useFakeTimers();
    let foreground = () => {};
    const { supervisor } = fixture({
      signals: {
        lifecycle: {
          subscribeForeground(listener) {
            foreground = listener;
            return () => {};
          },
        },
      },
    });
    subscribe.mockRejectedValueOnce(new Error("unavailable"));
    await supervisor.connect();
    expect(supervisor.getState().status).toBe("retrying");
    foreground();
    await vi.waitFor(() => expect(supervisor.getState().status).toBe("live"));
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("probes a live connection on wake and reconnects only if the probe fails", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const { supervisor } = fixture({ probe });
    await supervisor.connect();
    supervisor.wake();
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce());
    expect(subscribe).toHaveBeenCalledOnce();

    probe.mockRejectedValueOnce(new Error("dead socket"));
    supervisor.wake();
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(supervisor.getState().status).toBe("live"));
  });

  it("replaces a live session at once when the foreground follows a long suspension", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    let foreground: (wakeup?: "probe" | "reconnect") => void = () => {};
    const { supervisor, close } = fixture({
      probe,
      signals: {
        network: networkSignal(false),
        lifecycle: {
          subscribeForeground(listener) {
            foreground = listener;
            return () => {};
          },
        },
      },
    });
    await supervisor.connect();

    foreground("reconnect");
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    expect(close).toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(supervisor.getState().status).toBe("live"));
  });

  it("publishes state changes to subscribers", async () => {
    const { supervisor } = fixture();
    const statuses: string[] = [];
    supervisor.subscribeState((state) => statuses.push(state.status));
    await supervisor.connect();
    supervisor.dispose();
    expect(statuses).toEqual(["connecting", "live", "disposed"]);
  });
});
