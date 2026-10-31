import {
  type HostAccessScope,
  hostEndpointBase,
  isHostAccessScope,
} from "@cocurdex/shared";

export interface SavedHost {
  hostId: string;
  name: string;
  baseUrl: string;
  deviceId: string;
  hostKey: string;
  deviceSecretKey: string;
  scopes: HostAccessScope[];
  pairedAt: string;
  endpoints?: string[];
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
    [
      "hostId",
      "name",
      "baseUrl",
      "deviceId",
      "hostKey",
      "deviceSecretKey",
      "pairedAt",
    ].every((key) => typeof host[key] === "string") &&
    Array.isArray(host.scopes) &&
    host.scopes.every(
      (scope) => typeof scope === "string" && isHostAccessScope(scope),
    ) &&
    (host.endpoints === undefined ||
      (Array.isArray(host.endpoints) &&
        host.endpoints.every((endpoint) => typeof endpoint === "string")))
  );
}

export function uniqueOrigins(urls: readonly string[]) {
  const origins: string[] = [];
  for (const url of urls) {
    const origin = hostEndpointBase(url);
    if (origin && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

export function savedHostOrigins(
  host: Pick<SavedHost, "baseUrl" | "endpoints">,
) {
  return uniqueOrigins([host.baseUrl, ...(host.endpoints ?? [])]);
}

function sameBaseUrl(left: string, right: string) {
  const base = hostEndpointBase(left);
  return base !== null && base === hostEndpointBase(right);
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
