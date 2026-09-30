import type { AgentToolCallResult } from "@cocurdex/shared";
import { atom, type Getter, type Setter } from "jotai";
import { desktopApi } from "@/lib";

export type ToolCallResultCacheEntry =
  | { status: "loading" }
  | { status: "loaded"; value: AgentToolCallResult | null }
  | { status: "error"; message: string };

type ResultLease = {
  sessionId: string;
  consumers: number;
  request: object | null;
  stale: boolean;
};

export const toolCallResultCacheAtom = atom<
  Record<string, ToolCallResultCacheEntry>
>({});
const resultLeasesAtom = atom(() => new Map<string, ResultLease>());

function setResultEntry(
  get: Getter,
  set: Setter,
  toolCallId: string,
  entry: ToolCallResultCacheEntry,
) {
  set(toolCallResultCacheAtom, {
    ...get(toolCallResultCacheAtom),
    [toolCallId]: entry,
  });
}

export const refreshToolCallResultAtom = atom(
  null,
  async (get, set, toolCallId: string) => {
    const lease = get(resultLeasesAtom).get(toolCallId);
    if (!lease) return;
    if (lease.request) {
      lease.stale = true;
      return;
    }
    const request = {};
    lease.request = request;
    if (get(toolCallResultCacheAtom)[toolCallId]?.status !== "loaded") {
      setResultEntry(get, set, toolCallId, { status: "loading" });
    }
    const isCurrent = () =>
      get(resultLeasesAtom).get(toolCallId) === lease &&
      lease.request === request;
    do {
      lease.stale = false;
      let entry: ToolCallResultCacheEntry;
      try {
        const value = await desktopApi.getToolCallResult(toolCallId);
        entry = { status: "loaded", value };
      } catch (error) {
        entry = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (!isCurrent()) return;
      setResultEntry(get, set, toolCallId, entry);
    } while (lease.stale);
    lease.request = null;
  },
);

export const observeToolCallResultAtom = atom(
  null,
  (
    get,
    set,
    { toolCallId, sessionId }: { toolCallId: string; sessionId: string },
  ) => {
    const leases = get(resultLeasesAtom);
    const lease = leases.get(toolCallId) ?? {
      sessionId,
      consumers: 0,
      request: null,
      stale: false,
    };
    lease.consumers += 1;
    leases.set(toolCallId, lease);
    const entry = get(toolCallResultCacheAtom)[toolCallId];
    if (!entry || entry.status === "error")
      void set(refreshToolCallResultAtom, toolCallId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (leases.get(toolCallId) !== lease) return;
      lease.consumers -= 1;
      if (lease.consumers > 0) return;
      leases.delete(toolCallId);
      const { [toolCallId]: _removed, ...remaining } = get(
        toolCallResultCacheAtom,
      );
      set(toolCallResultCacheAtom, remaining);
    };
  },
);

export const clearToolCallResultsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const leases = get(resultLeasesAtom);
    const cache = { ...get(toolCallResultCacheAtom) };
    for (const [id, lease] of leases) {
      if (lease.sessionId !== sessionId) continue;
      leases.delete(id);
      delete cache[id];
    }
    set(toolCallResultCacheAtom, cache);
  },
);
