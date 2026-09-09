import type {
  AgentToolCallRecord,
  AgentToolCallResult,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";

export type ToolCallResultCacheEntry =
  | { status: "loading" }
  | { status: "loaded"; value: AgentToolCallResult | null }
  | { status: "error"; message: string };

type ResultLease = { sessionId: string; consumers: number };

export const toolCallResultCacheAtom = atom<
  Record<string, ToolCallResultCacheEntry>
>({});
const resultLeasesAtom = atom(() => new Map<string, ResultLease>());

export const refreshToolCallResultAtom = atom(
  null,
  async (get, set, toolCallId: string) => {
    const lease = get(resultLeasesAtom).get(toolCallId);
    if (!lease) return;
    const pending: ToolCallResultCacheEntry = { status: "loading" };
    set(toolCallResultCacheAtom, {
      ...get(toolCallResultCacheAtom),
      [toolCallId]: pending,
    });
    const isCurrent = () =>
      get(resultLeasesAtom).get(toolCallId) === lease &&
      get(toolCallResultCacheAtom)[toolCallId] === pending;
    try {
      const value = await desktopApi.getToolCallResult(toolCallId);
      if (!isCurrent()) return;
      set(toolCallResultCacheAtom, {
        ...get(toolCallResultCacheAtom),
        [toolCallId]: { status: "loaded", value },
      });
    } catch (error) {
      if (!isCurrent()) return;
      set(toolCallResultCacheAtom, {
        ...get(toolCallResultCacheAtom),
        [toolCallId]: {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
    const lease = leases.get(toolCallId) ?? { sessionId, consumers: 0 };
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

export const applyToolCallResultAtom = atom(
  null,
  (get, set, toolCall: AgentToolCallRecord) => {
    if (!get(resultLeasesAtom).has(toolCall.id)) return;
    if (toolCall.content === undefined && toolCall.rawOutput === undefined)
      return;
    set(toolCallResultCacheAtom, {
      ...get(toolCallResultCacheAtom),
      [toolCall.id]: {
        status: "loaded",
        value: {
          content: toolCall.content ?? [],
          rawOutput: toolCall.rawOutput,
        },
      },
    });
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
