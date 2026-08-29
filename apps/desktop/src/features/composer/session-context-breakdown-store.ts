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

    // Each report is a full snapshot of the window, so the latest one wins.
    set(sessionContextBreakdownAtom, {
      ...get(sessionContextBreakdownAtom),
      [event.sessionId]: event.breakdown,
    });
  },
);
