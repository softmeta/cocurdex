import {
  createHostConnection,
  type HostConnection,
  type HostConnectionOptions,
} from "./host-connection";

export type HostRemovedListener = (hostId: string) => void;

export type HostRegistry = ReturnType<typeof createHostRegistry>;

export function createHostRegistry(
  create: (options: HostConnectionOptions) => HostConnection = (options) =>
    createHostConnection(options),
) {
  const hosts = new Map<string, HostConnection>();
  const removedListeners = new Set<HostRemovedListener>();

  return {
    register(options: HostConnectionOptions) {
      const existing = hosts.get(options.hostId);
      if (existing) return existing;
      const host = create(options);
      hosts.set(options.hostId, host);
      return host;
    },
    get(hostId: string) {
      return hosts.get(hostId) ?? null;
    },
    list() {
      return [...hosts.values()];
    },
    remove(hostId: string) {
      const host = hosts.get(hostId);
      if (!host) return false;
      hosts.delete(hostId);
      host.dispose();
      for (const listener of [...removedListeners]) listener(hostId);
      return true;
    },
    onHostRemoved(listener: HostRemovedListener) {
      removedListeners.add(listener);
      return () => {
        removedListeners.delete(listener);
      };
    },
  };
}
