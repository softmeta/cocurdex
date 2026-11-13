import { stat } from "node:fs/promises";
import path from "node:path";
import {
  MEMORY_USER_LIBRARY_PREFIX,
  type MemoryEntry,
  type MemoryRecallItem,
  type MemoryUserLibraryStatus,
} from "@cocurdex/shared";
import { parseRecallPayload, parseShowPayload } from "./rsrs";
import { execRuntimeCli, findRuntime, type RuntimeEndpoint } from "./runtime";

const CACHE_MS = 30_000;

async function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  );
}

function tag(id: string) {
  return `${MEMORY_USER_LIBRARY_PREFIX}${id}`;
}

// The user's own rsrs store, read through the runtime the user runs. Cocurdex
// never starts that runtime, runs the user's CLI, or sends it a write.
export class UserRsrsLibrary {
  private endpoint: { value: RuntimeEndpoint | null; at: number } | null = null;

  constructor(
    private readonly options: {
      dataDir(): Promise<string | null>;
      now(): number;
    },
  ) {}

  async status(): Promise<MemoryUserLibraryStatus> {
    const dataDir = await this.options.dataDir();
    if (!dataDir) return { detected: false, reachable: false };
    const detected = await exists(path.join(dataDir, "session.json"));
    return {
      detected,
      reachable: detected && (await this.runtime()) !== null,
    };
  }

  private async runtime() {
    const now = this.options.now();
    if (this.endpoint && now - this.endpoint.at < CACHE_MS) {
      return this.endpoint.value;
    }
    const dataDir = await this.options.dataDir();
    const value = dataDir ? await findRuntime(dataDir) : null;
    this.endpoint = { value, at: now };
    return value;
  }

  async recall(input: {
    query: string;
    limit: number;
    timeoutMs: number;
  }): Promise<MemoryRecallItem[]> {
    const endpoint = await this.runtime();
    if (!endpoint) return [];
    const { payload } = await execRuntimeCli(
      endpoint,
      [
        "recall",
        "--json",
        "--titles",
        "--limit",
        String(input.limit),
        input.query,
      ],
      input.timeoutMs,
    );
    return parseRecallPayload(payload).map((item) => ({
      ...item,
      id: tag(item.id),
    }));
  }

  async show(id: string, timeoutMs: number): Promise<MemoryEntry | null> {
    const endpoint = await this.runtime();
    if (!endpoint) return null;
    const raw = id.slice(MEMORY_USER_LIBRARY_PREFIX.length);
    const { payload } = await execRuntimeCli(
      endpoint,
      ["show", "--json", raw],
      timeoutMs,
    );
    const entry = parseShowPayload(payload);
    return entry
      ? { ...entry, id: tag(entry.id), parentId: null, project: null }
      : null;
  }
}
