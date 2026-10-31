import { type HostAccessScope, isHostAccessScope } from "@cocurdex/shared";

export interface SavedHost {
  hostId: string;
  name: string;
  baseUrl: string;
  deviceId: string;
  token: string;
  scopes: HostAccessScope[];
  pairedAt: string;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVED_HOSTS_STORAGE_KEY = "cocurdex.savedHosts";

function isSavedHost(value: unknown): value is SavedHost {
  if (typeof value !== "object" || value === null) return false;
  const host = value as Record<string, unknown>;
  return (
    ["hostId", "name", "baseUrl", "deviceId", "token", "pairedAt"].every(
      (key) => typeof host[key] === "string",
    ) &&
    Array.isArray(host.scopes) &&
    host.scopes.every(
      (scope) => typeof scope === "string" && isHostAccessScope(scope),
    )
  );
}

function sameBaseUrl(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function createSavedHostStore(
  storage: KeyValueStorage | null,
  key = SAVED_HOSTS_STORAGE_KEY,
) {
  function read(): SavedHost[] {
    try {
      const parsed = JSON.parse(storage?.getItem(key) ?? "[]") as unknown;
      return Array.isArray(parsed) ? parsed.filter(isSavedHost) : [];
    } catch {
      return [];
    }
  }

  function write(hosts: SavedHost[]) {
    try {
      storage?.setItem(key, JSON.stringify(hosts));
    } catch {}
  }

  return {
    list: read,
    findByBaseUrl(baseUrl: string) {
      return read().find((host) => sameBaseUrl(host.baseUrl, baseUrl)) ?? null;
    },
    save(host: SavedHost) {
      write([
        ...read().filter(
          (saved) =>
            saved.hostId !== host.hostId &&
            !sameBaseUrl(saved.baseUrl, host.baseUrl),
        ),
        host,
      ]);
    },
    remove(hostId: string) {
      write(read().filter((saved) => saved.hostId !== hostId));
    },
    clear() {
      write([]);
    },
  };
}

export type SavedHostStore = ReturnType<typeof createSavedHostStore>;
