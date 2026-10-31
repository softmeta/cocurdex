import type { ConnectionState } from "@cocurdex/client-runtime";
import type { SessionsConnection } from "@cocurdex/mobile/internal/sessions/sessions-store";
import type { CocurdexDaemonEvent } from "@cocurdex/shared";
import { vi } from "vitest";

export function fakeConnection(results: Record<string, unknown[]>) {
  const eventListeners = new Set<(event: CocurdexDaemonEvent) => void>();
  const stateListeners = new Set<(state: ConnectionState) => void>();
  let state = { status: "idle" } as ConnectionState;
  const request = vi.fn(async (method: string) => {
    const queue = results[method];
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0];
    if (next instanceof Error) throw next;
    return next;
  });
  const connection = {
    request,
    getState: () => state,
    onEvent(listener: (event: CocurdexDaemonEvent) => void) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeState(listener: (next: ConnectionState) => void) {
      stateListeners.add(listener);
      return () => stateListeners.delete(listener);
    },
  } as unknown as SessionsConnection;
  return {
    connection,
    request,
    emit: (event: CocurdexDaemonEvent) => {
      for (const listener of eventListeners) listener(event);
    },
    setStatus(status: ConnectionState["status"]) {
      state = { ...state, status };
      for (const listener of stateListeners) listener(state);
    },
    listenerCount: () => eventListeners.size + stateListeners.size,
  };
}

export const calls = (request: ReturnType<typeof vi.fn>, method: string) =>
  request.mock.calls.filter(([name]) => name === method).length;
