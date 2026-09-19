import type { ChatContextRequest } from "./chat-context-store";
import type { ChatWindowApi } from "./chat-window-types";

async function unavailable(): Promise<never> {
  throw new Error("Independent chat windows require the desktop app");
}

const contexts = new Map<string, ChatContextRequest>();
const contextListeners = new Set<() => void>();

export const chatWindowFallback: ChatWindowApi = {
  addContext: async (request) => {
    contexts.set(request.id, request);
    for (const listener of contextListeners) listener();
  },
  getPendingContext: async () => [...contexts.values()],
  acknowledgeContext: async (id) => {
    contexts.delete(id);
  },
  onContextAvailable: (listener) => {
    contextListeners.add(listener);
    return () => {
      contextListeners.delete(listener);
    };
  },
  setBrowserContext: async () => {},
  getBrowserContext: async () => [],
  onBrowserContext: () => () => {},
  detach: unavailable,
  reattach: unavailable,
  bootstrap: async () => null,
  ready: unavailable,
  checkpoint: unavailable,
  focus: unavailable,
  toggleVisibility: unavailable,
  getState: async () => ({ detached: false, transitioning: false }),
  onState: () => () => {},
  onTransfer: () => () => {},
};
