import {
  createSavedHostStore,
  HostAccessError,
  type KeyValueStorage,
  pairHost,
  type SavedHost,
} from "@cocurdex/client-runtime";
import type { HostAccessScope } from "@cocurdex/shared";
import { parseHostPairingLink } from "@cocurdex/shared";

function sameScopes(left: HostAccessScope[], right: HostAccessScope[]) {
  return (
    left.length === right.length && left.every((scope) => right.includes(scope))
  );
}

export type PairFailure = "link" | "invalid" | "rateLimited" | "unreachable";

export function createHostsStore(storage: KeyValueStorage) {
  const store = createSavedHostStore(storage);
  const listeners = new Set<() => void>();
  let snapshot: SavedHost[] = store.list();

  const publish = () => {
    snapshot = store.list();
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    async pair(
      link: string,
      label: string,
      fetchImpl?: typeof fetch,
    ): Promise<{ host: SavedHost } | { failure: PairFailure }> {
      const parsed = parseHostPairingLink(link);
      if (!parsed) return { failure: "link" };
      try {
        const host = await pairHost({
          ...parsed,
          label,
          store,
          fetch: fetchImpl,
        });
        publish();
        return { host };
      } catch (error) {
        if (error instanceof HostAccessError) return { failure: error.reason };
        throw error;
      }
    },
    adoptScopes(hostId: string, scopes: HostAccessScope[]) {
      const saved = snapshot.find((host) => host.hostId === hostId);
      if (!saved || sameScopes(saved.scopes, scopes)) return;
      store.save({ ...saved, scopes });
      publish();
    },
    rename(hostId: string, name: string) {
      const saved = snapshot.find((host) => host.hostId === hostId);
      const trimmed = name.trim();
      if (!saved || trimmed === "" || trimmed === saved.name) return;
      store.save({ ...saved, name: trimmed });
      publish();
    },
    remove(hostId: string) {
      store.remove(hostId);
      publish();
    },
    clear() {
      store.clear();
      publish();
    },
  };
}

export type HostsStore = ReturnType<typeof createHostsStore>;

export interface InstallMarker {
  exists(): boolean;
  create(): void;
}

export function forgetHostsFromPreviousInstall(
  marker: InstallMarker,
  hosts: Pick<HostsStore, "clear">,
) {
  if (marker.exists()) return;
  hosts.clear();
  marker.create();
}
