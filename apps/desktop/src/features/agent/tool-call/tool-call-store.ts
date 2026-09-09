import type {
  AgentEvent,
  AgentToolCallRecord,
  SessionRecord,
} from "@cocurdex/shared";
import { atom } from "jotai";
import {
  applyToolCallResultAtom,
  clearToolCallResultsForSessionAtom,
  refreshToolCallResultAtom,
  toolCallResultCacheAtom,
} from "./tool-call-result-store";

type ToolCallsBySession = Record<string, AgentToolCallRecord[]>;
type LoadedBySession = Record<string, boolean>;

export const toolCallsBySessionAtom = atom<ToolCallsBySession>({});
export const toolCallsLoadedBySessionAtom = atom<LoadedBySession>({});

function toToolCallSummary(toolCall: AgentToolCallRecord): AgentToolCallRecord {
  const { content: _content, rawOutput: _rawOutput, ...summary } = toolCall;
  return { ...summary, content: undefined };
}

export const bootstrapToolCallsAtom = atom(
  null,
  (_get, set, toolCalls: AgentToolCallRecord[]) => {
    // Group then sort. Avoids spread-on-accumulator (O(n^2)).
    const grouped = new Map<string, AgentToolCallRecord[]>();
    for (const toolCall of toolCalls) {
      const bucket = grouped.get(toolCall.sessionId);
      if (bucket) {
        bucket.push(toToolCallSummary(toolCall));
      } else {
        grouped.set(toolCall.sessionId, [toToolCallSummary(toolCall)]);
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
    const mergedToolCalls = new Map(
      payload.toolCalls.map((toolCall) => [toolCall.id, toolCall]),
    );

    for (const existingToolCall of current[payload.sessionId] ?? []) {
      const persistedToolCall = mergedToolCalls.get(existingToolCall.id);
      mergedToolCalls.set(
        existingToolCall.id,
        persistedToolCall
          ? selectToolCall(persistedToolCall, existingToolCall)
          : existingToolCall,
      );
    }

    const nextSessionToolCalls = [...mergedToolCalls.values()]
      .map(toToolCallSummary)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));

    set(toolCallsBySessionAtom, {
      ...current,
      [payload.sessionId]: nextSessionToolCalls,
    });
    set(toolCallsLoadedBySessionAtom, {
      ...get(toolCallsLoadedBySessionAtom),
      [payload.sessionId]: true,
    });
    const previousById = new Map(
      (current[payload.sessionId] ?? []).map((toolCall) => [
        toolCall.id,
        toolCall,
      ]),
    );
    const resultCache = get(toolCallResultCacheAtom);
    for (const toolCall of nextSessionToolCalls) {
      if (!resultCache[toolCall.id]) continue;
      const previous = previousById.get(toolCall.id);
      if (
        previous?.updatedAt !== toolCall.updatedAt ||
        previous.status !== toolCall.status
      ) {
        void set(refreshToolCallResultAtom, toolCall.id);
      }
    }
  },
);

export const clearToolCallsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(toolCallsBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;

    set(toolCallsBySessionAtom, next);
    const { [sessionId]: _loaded, ...remainingLoaded } = get(
      toolCallsLoadedBySessionAtom,
    );
    set(toolCallsLoadedBySessionAtom, remainingLoaded);
    set(clearToolCallResultsForSessionAtom, sessionId);
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

  const selectedToolCall = selectToolCall(
    toolCalls[existingIndex],
    nextToolCall,
  );
  if (selectedToolCall === toolCalls[existingIndex]) {
    return toolCalls;
  }
  return toolCalls.map((toolCall, index) =>
    index === existingIndex ? selectedToolCall : toolCall,
  );
}

function selectToolCall(
  existingToolCall: AgentToolCallRecord,
  nextToolCall: AgentToolCallRecord,
) {
  const timestampOrder = existingToolCall.updatedAt.localeCompare(
    nextToolCall.updatedAt,
  );
  if (timestampOrder > 0) {
    return existingToolCall;
  } else if (
    timestampOrder === 0 &&
    isTerminalToolCall(existingToolCall) &&
    !isTerminalToolCall(nextToolCall)
  ) {
    return existingToolCall;
  }
  return nextToolCall;
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
  const existing = sessionToolCalls.find(
    (toolCall) => toolCall.id === event.toolCall.id,
  );
  if (existing && selectToolCall(existing, event.toolCall) === existing) return;

  set(toolCallsBySessionAtom, {
    ...current,
    [event.sessionId]: upsertToolCall(
      sessionToolCalls,
      toToolCallSummary(event.toolCall),
    ),
  });
  set(applyToolCallResultAtom, event.toolCall);
});
