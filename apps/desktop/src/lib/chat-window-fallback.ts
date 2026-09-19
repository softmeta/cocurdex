import type {
  ChatWindowApi,
  ChatWindowIntentRequest,
} from "./chat-window-types";

async function unavailable(): Promise<never> {
  throw new Error("Independent chat windows require the desktop app");
}

// In environments without the Electron bridge the whole app shares one window,
// so every surface resolves locally: dispatched intents queue in-memory and are
// consumed by this window's own intent listeners.
const intents = new Map<string, ChatWindowIntentRequest>();
const intentListeners = new Set<() => void>();

export const chatWindowFallback: ChatWindowApi = {
  dispatchIntent: async (request) => {
    const id = request.id ?? crypto.randomUUID();
    intents.set(id, { id, surface: request.surface, intent: request.intent });
    for (const listener of intentListeners) listener();
  },
  getPendingIntents: async () => [...intents.values()],
  acknowledgeIntent: async (id) => {
    intents.delete(id);
  },
  onIntentAvailable: (listener) => {
    intentListeners.add(listener);
    return () => {
      intentListeners.delete(listener);
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
