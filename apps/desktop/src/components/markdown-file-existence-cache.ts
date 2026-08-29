type CheckFileExists = (absolutePath: string) => Promise<boolean>;

interface FileExistenceEntry {
  checkedAt?: number;
  promise?: Promise<boolean>;
  value?: boolean;
}

interface MarkdownFileExistenceCacheOptions {
  maxEntries?: number;
  negativeTtlMs?: number;
  now?: () => number;
  positiveTtlMs?: number;
}

const DEFAULT_MAX_ENTRIES = 500;
const DEFAULT_NEGATIVE_TTL_MS = 30_000;
const DEFAULT_POSITIVE_TTL_MS = 5 * 60_000;

export function createMarkdownFileExistenceCache(
  options: MarkdownFileExistenceCacheOptions = {},
) {
  const entries = new Map<string, FileExistenceEntry>();
  const listeners = new Map<string, Set<() => void>>();
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const negativeTtlMs = options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
  const now = options.now ?? Date.now;
  const positiveTtlMs = options.positiveTtlMs ?? DEFAULT_POSITIVE_TTL_MS;

  function notify(absolutePath: string) {
    for (const listener of listeners.get(absolutePath) ?? []) {
      listener();
    }
  }

  function setEntry(absolutePath: string, entry: FileExistenceEntry) {
    entries.delete(absolutePath);
    entries.set(absolutePath, entry);
    while (entries.size > maxEntries) {
      const oldestPath = entries.keys().next().value;
      if (oldestPath === undefined) {
        return;
      }
      entries.delete(oldestPath);
    }
  }

  function isFresh(entry: FileExistenceEntry) {
    if (entry.value === undefined || entry.checkedAt === undefined) {
      return false;
    }
    const ttlMs = entry.value ? positiveTtlMs : negativeTtlMs;
    return now() - entry.checkedAt < ttlMs;
  }

  function probe(checkExists: CheckFileExists, absolutePath: string) {
    const previous = entries.get(absolutePath);
    if (previous?.promise) {
      return previous.promise;
    }
    if (previous && isFresh(previous)) {
      setEntry(absolutePath, previous);
      return Promise.resolve(previous.value ?? false);
    }

    const pending = checkExists(absolutePath)
      .then((value) => {
        setEntry(absolutePath, { checkedAt: now(), value });
        notify(absolutePath);
        return value;
      })
      .catch(() => {
        if (previous?.value === undefined) {
          entries.delete(absolutePath);
          return false;
        }
        setEntry(absolutePath, previous);
        return previous.value;
      });
    setEntry(absolutePath, { ...previous, promise: pending });
    return pending;
  }

  function getSnapshot(absolutePath: string | undefined) {
    return absolutePath ? entries.get(absolutePath)?.value === true : false;
  }

  function subscribe(absolutePath: string, listener: () => void) {
    const pathListeners = listeners.get(absolutePath) ?? new Set<() => void>();
    pathListeners.add(listener);
    listeners.set(absolutePath, pathListeners);
    return () => {
      pathListeners.delete(listener);
      if (pathListeners.size === 0) {
        listeners.delete(absolutePath);
      }
    };
  }

  return { getSnapshot, probe, subscribe };
}
