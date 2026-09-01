import type {
  AgentEvent,
  AgentToolCallRecord,
  AgentToolCallResult,
  SessionRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi } from "@/lib";

type ToolCallsBySession = Record<string, AgentToolCallRecord[]>;
type LoadedBySession = Record<string, boolean>;

// Lazy result cache. Session loads return tool-call summaries without content
// or rawOutput; the cache hydrates both on the first detail open and stays warm
// across repeated opens within the session.
export type ToolCallResultCacheEntry =
  | { status: "loading" }
  | { status: "loaded"; value: AgentToolCallResult | null }
  | { status: "error"; message: string };

type ToolCallResultCache = Record<string, ToolCallResultCacheEntry>;

export const toolCallsBySessionAtom = atom<ToolCallsBySession>({});
export const toolCallsLoadedBySessionAtom = atom<LoadedBySession>({});
export const toolCallResultCacheAtom = atom<ToolCallResultCache>({});

export const bootstrapToolCallsAtom = atom(
  null,
  (_get, set, toolCalls: AgentToolCallRecord[]) => {
    // Group then sort. Avoids spread-on-accumulator (O(n^2)).
    const grouped = new Map<string, AgentToolCallRecord[]>();
    for (const toolCall of toolCalls) {
      const bucket = grouped.get(toolCall.sessionId);
      if (bucket) {
        bucket.push(toolCall);
      } else {
        grouped.set(toolCall.sessionId, [toolCall]);
      }
    }

    const nextToolCallsBySession: ToolCallsBySession = {};
    for (const [sessionId, sessionToolCalls] of grouped) {
      nextToolCallsBySession[sessionId] = [...sessionToolCalls].sort(
        (left, right) => left.startedAt.localeCompare(right.startedAt),
      );
    }

    set(toolCallsBySessionAtom, nextToolCallsBySession);
    set(
      toolCallsLoadedBySessionAtom,
      Object.fromEntries(
        Object.keys(nextToolCallsBySession).map((sessionId) => [
          sessionId,
          true,
        ]),
      ),
    );
  },
);

export const loadSessionToolCallsAtom = atom(
  null,
  (
    get,
    set,
    payload: { sessionId: string; toolCalls: AgentToolCallRecord[] },
  ) => {
    const current = get(toolCallsBySessionAtom);
    let nextSessionToolCalls = payload.toolCalls;

    for (const existingToolCall of current[payload.sessionId] ?? []) {
      nextSessionToolCalls = upsertToolCall(
        nextSessionToolCalls,
        existingToolCall,
      );
    }

    nextSessionToolCalls = [...nextSessionToolCalls].sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt),
    );

    set(toolCallsBySessionAtom, {
      ...current,
      [payload.sessionId]: nextSessionToolCalls,
    });
    set(toolCallsLoadedBySessionAtom, {
      ...get(toolCallsLoadedBySessionAtom),
      [payload.sessionId]: true,
    });
  },
);

export const clearToolCallsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(toolCallsBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;

    set(toolCallsBySessionAtom, next);
  },
);

function upsertToolCall(
  toolCalls: AgentToolCallRecord[],
  nextToolCall: AgentToolCallRecord,
) {
  const existingIndex = toolCalls.findIndex(
    (toolCall) => toolCall.id === nextToolCall.id,
  );

  if (existingIndex === -1) {
    return [...toolCalls, nextToolCall].sort((left, right) =>
      left.startedAt.localeCompare(right.startedAt),
    );
  }

  const existingToolCall = toolCalls[existingIndex];
  let selectedToolCall = nextToolCall;
  const timestampOrder = existingToolCall.updatedAt.localeCompare(
    nextToolCall.updatedAt,
  );
  if (timestampOrder > 0) {
    selectedToolCall = existingToolCall;
  } else if (
    timestampOrder === 0 &&
    isTerminalToolCall(existingToolCall) &&
    !isTerminalToolCall(nextToolCall)
  ) {
    selectedToolCall = existingToolCall;
  }

  return toolCalls.map((toolCall, index) =>
    index === existingIndex ? selectedToolCall : toolCall,
  );
}

function isTerminalToolCall(toolCall: AgentToolCallRecord) {
  return toolCall.status === "completed" || toolCall.status === "failed";
}

export function shouldRefreshSessionToolCalls(
  sessionStatus: SessionRecord["status"],
  loaded: boolean,
  toolCalls: AgentToolCallRecord[],
) {
  if (!loaded) {
    return true;
  }
  if (sessionStatus === "running") {
    return false;
  }
  return toolCalls.some((toolCall) => !isTerminalToolCall(toolCall));
}

export const applyToolEventAtom = atom(null, (get, set, event: AgentEvent) => {
  if (
    event.type !== "tool.started" &&
    event.type !== "tool.updated" &&
    event.type !== "tool.finished"
  ) {
    return;
  }

  const current = get(toolCallsBySessionAtom);
  const sessionToolCalls = current[event.sessionId] ?? [];

  set(toolCallsBySessionAtom, {
    ...current,
    [event.sessionId]: upsertToolCall(sessionToolCalls, event.toolCall),
  });
  set(toolCallsLoadedBySessionAtom, {
    ...get(toolCallsLoadedBySessionAtom),
    [event.sessionId]: true,
  });

  // Live updates carry the authoritative result accumulated so far. Keep the
  // detail cache synchronized instead of waiting for the terminal event.
  if (event.type !== "tool.started") {
    const resultCache = get(toolCallResultCacheAtom);
    set(toolCallResultCacheAtom, {
      ...resultCache,
      [event.toolCall.id]: {
        status: "loaded",
        value: {
          content: event.toolCall.content ?? [],
          rawOutput: event.toolCall.rawOutput,
        },
      },
    });
  }
});

export const fetchToolCallResultAtom = atom(
  null,
  async (get, set, toolCallId: string) => {
    const cache = get(toolCallResultCacheAtom);
    const existing = cache[toolCallId];
    // Re-issue on prior error so the user can retry by re-opening the detail.
    if (existing && existing.status !== "error") {
      return;
    }

    set(toolCallResultCacheAtom, {
      ...cache,
      [toolCallId]: { status: "loading" },
    });

    try {
      const value = await desktopApi.getToolCallResult(toolCallId);
      set(toolCallResultCacheAtom, {
        ...get(toolCallResultCacheAtom),
        [toolCallId]: { status: "loaded", value },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set(toolCallResultCacheAtom, {
        ...get(toolCallResultCacheAtom),
        [toolCallId]: { status: "error", message },
      });
    }
  },
);
