import {
  type AgentEvent,
  type AgentUsageRecord,
  getContextUsageTokens,
  mergeUsageRecords,
} from "@cocurdex/shared";
import { atom } from "jotai";

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

export function addUsageRecords(
  current: AgentUsageRecord | undefined,
  delta: AgentUsageRecord,
): AgentUsageRecord {
  return mergeUsageRecords(current, delta);
}

export function getSessionContextTokens(usage: AgentUsageRecord) {
  return getContextUsageTokens(usage);
}
