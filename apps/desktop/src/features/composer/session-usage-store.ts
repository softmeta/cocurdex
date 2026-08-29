import {
  type AgentEvent,
  type AgentUsageRecord,
  getContextUsageTokens,
  mergeUsageRecords,
} from "@cocurdex/shared";
import { atom } from "jotai";

// Per-session token usage. Additive fields (input/output/cache/cost) accumulate
// across turns; absolute context-window fields replace on each update.
export const sessionUsageAtom = atom<Record<string, AgentUsageRecord>>({});

export const bootstrapSessionUsageAtom = atom(
  null,
  (_get, set, usageBySession: Record<string, AgentUsageRecord>) => {
    set(sessionUsageAtom, usageBySession);
  },
);

export const applyUsageEventAtom = atom(null, (get, set, event: AgentEvent) => {
  if (event.type !== "usage.updated") {
    return;
  }
  const next = { ...get(sessionUsageAtom) };
  next[event.sessionId] = mergeUsageRecords(next[event.sessionId], event.usage);
  set(sessionUsageAtom, next);
});

/** @deprecated Prefer `mergeUsageRecords` from `@cocurdex/shared`. */
export function addUsageRecords(
  current: AgentUsageRecord | undefined,
  delta: AgentUsageRecord,
): AgentUsageRecord {
  return mergeUsageRecords(current, delta);
}

/** Current context-window fill, when reported by the active adapter. */
export function getSessionContextTokens(usage: AgentUsageRecord) {
  return getContextUsageTokens(usage);
}
