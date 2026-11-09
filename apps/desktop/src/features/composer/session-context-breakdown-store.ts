import type { AgentContextBreakdownRecord, AgentEvent } from "@cocurdex/shared";
import { atom } from "jotai";

export const sessionContextBreakdownAtom = atom<
  Record<string, AgentContextBreakdownRecord>
>({});

export const applyContextBreakdownEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (event.type !== "context_breakdown.updated") {
      return;
    }

    set(sessionContextBreakdownAtom, {
      ...get(sessionContextBreakdownAtom),
      [event.sessionId]: event.breakdown,
    });
  },
);
