import type { MemoryPartition } from "@cocurdex/shared";
import useSWR, { mutate } from "swr";
import { desktopApi } from "@/lib";
import { MEMORY_STATUS_KEY } from "../memory-queries";

export type MemoryScope = "all" | "me" | `agent:${string}`;

const REVISION_POLL_MS = 5_000;
const LIBRARY_LIMIT = 500;
const HISTORY_LIMIT = 100;
const SWR_OPTIONS = { dedupingInterval: 0 };

export function scopePartition(scope: MemoryScope): MemoryPartition | null {
  if (scope === "all") return null;
  if (scope === "me") return { kind: "me" };
  return { kind: "agent", agentId: scope.slice("agent:".length) };
}

export function useMemoryRevision() {
  return useSWR("memory.revision", () => desktopApi.getMemoryRevision(), {
    ...SWR_OPTIONS,
    refreshInterval: REVISION_POLL_MS,
  });
}

export function useMemoryCapabilities() {
  return useSWR(
    "memory.capabilities",
    () => desktopApi.getMemoryCapabilities(),
    SWR_OPTIONS,
  );
}

export function useMemoryLibrary(scope: MemoryScope, revision: string | null) {
  return useSWR(
    ["memory.list", scope, revision],
    () =>
      desktopApi.listMemories({
        limit: LIBRARY_LIMIT,
        partition: scopePartition(scope),
      }),
    SWR_OPTIONS,
  );
}

export function useMemoryEntry(id: string | null, revision: string | null) {
  return useSWR(
    id ? ["memory.show", id, revision] : null,
    () => (id ? desktopApi.showMemory(id) : null),
    SWR_OPTIONS,
  );
}

export function useMemoryHistory(
  id: string | null,
  enabled: boolean,
  revision: string | null,
) {
  return useSWR(
    enabled ? ["memory.history", id, revision] : null,
    () => desktopApi.getMemoryHistory({ id, limit: HISTORY_LIMIT }),
    SWR_OPTIONS,
  );
}

export async function preloadMemoryLibrary() {
  const revision = await desktopApi.getMemoryRevision();
  await Promise.all([
    mutate("memory.revision", revision, { revalidate: false }),
    mutate(MEMORY_STATUS_KEY, desktopApi.getMemoryStatus(), {
      revalidate: false,
    }),
    mutate("memory.capabilities", desktopApi.getMemoryCapabilities(), {
      revalidate: false,
    }),
    mutate(
      ["memory.list", "all", revision],
      desktopApi.listMemories({ limit: LIBRARY_LIMIT, partition: null }),
      { revalidate: false },
    ),
  ]);
}
