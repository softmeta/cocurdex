import {
  createSavedHostStore,
  HostAccessError,
  type KeyValueStorage,
  pairHost,
  type SavedHost,
  savedHostOrigins,
  uniqueOrigins,
} from "@cocurdex/client-runtime";
import type { HostAccessScope } from "@cocurdex/shared";
import { parseHostPairingLink } from "@cocurdex/shared";

function sameMembers<T>(left: readonly T[], right: readonly T[]) {
  return (
    left.length === right.length && left.every((item) => right.includes(item))
  );
}

function sameOrder(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

export interface ReportedHostSession {
  scopes?: HostAccessScope[];
  endpoints?: string[];
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
    adoptSession(hostId: string, reported: ReportedHostSession) {
      const saved = snapshot.find((host) => host.hostId === hostId);
      if (!saved) return;
      const scopes = reported.scopes ?? saved.scopes;
      const endpoints = reported.endpoints
        ? uniqueOrigins([saved.baseUrl, ...reported.endpoints])
        : savedHostOrigins(saved);
      if (
        sameMembers(saved.scopes, scopes) &&
        sameOrder(savedHostOrigins(saved), endpoints)
      ) {
        return;
      }
      store.save({ ...saved, scopes, endpoints });
      publish();
    },
    switchOrigin(hostId: string, origin: string) {
      const saved = snapshot.find((host) => host.hostId === hostId);
      if (!saved || saved.baseUrl === origin) return;
      store.save({
        ...saved,
        baseUrl: origin,
        endpoints: uniqueOrigins([origin, ...savedHostOrigins(saved)]),
      });
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
