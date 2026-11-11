import {
  joinTranscriptPages,
  mergeOlderBoundary,
} from "@cocurdex/client-runtime";
import type { SessionTranscriptPage } from "@cocurdex/shared";
import { atom } from "jotai";
import { mergeTurnChangeSetsAtom } from "@/features/turn-workspace-changes";
import { desktopApi } from "@/lib";
import { loadSessionToolCallsAtom } from "../tool-call/tool-call-store";
import { loadSessionMessagesAtom, loadTurnStatsAtom } from "./message-store";

export const olderTranscriptBeforeSeqAtom = atom<Record<string, number | null>>(
  {},
);

const loadingOlderAtom = atom<ReadonlySet<string>>(new Set<string>());

export const sessionHasOlderTranscriptAtom = atom(
  (get) => (sessionId: string) =>
    typeof get(olderTranscriptBeforeSeqAtom)[sessionId] === "number",
);

export const recordOlderBoundaryAtom = atom(
  null,
  (get, set, input: { sessionId: string; olderBeforeSeq: number | null }) => {
    const current = get(olderTranscriptBeforeSeqAtom);
    const next = mergeOlderBoundary(
      current[input.sessionId],
      input.olderBeforeSeq,
    );
    if (current[input.sessionId] === next) return;
    set(olderTranscriptBeforeSeqAtom, { ...current, [input.sessionId]: next });
  },
);

export const applyTranscriptPageAtom = atom(
  null,
  (_get, set, input: { sessionId: string; page: SessionTranscriptPage }) => {
    const { page, sessionId } = input;
    set(loadSessionMessagesAtom, { messages: page.messages, sessionId });
    set(loadTurnStatsAtom, page.turnStats);
    set(mergeTurnChangeSetsAtom, { changeSets: page.turnChangeSets });
    set(loadSessionToolCallsAtom, { sessionId, toolCalls: page.toolCalls });
    set(recordOlderBoundaryAtom, {
      sessionId,
      olderBeforeSeq: page.olderBeforeSeq,
    });
  },
);

async function fetchOlderPages(
  sessionId: string,
  beforeSeq: number,
  all: boolean,
): Promise<SessionTranscriptPage> {
  let page = await desktopApi.getTranscriptPage(sessionId, beforeSeq);
  while (all && page.olderBeforeSeq !== null) {
    const older = await desktopApi.getTranscriptPage(
      sessionId,
      page.olderBeforeSeq,
    );
    page = joinTranscriptPages(older, page);
  }
  return page;
}

export const loadOlderTranscriptAtom = atom(
  null,
  async (
    get,
    set,
    input: { sessionId: string; all?: boolean; beforeApply(): void },
  ) => {
    const { sessionId } = input;
    const beforeSeq = get(olderTranscriptBeforeSeqAtom)[sessionId];
    const loading = get(loadingOlderAtom);
    if (typeof beforeSeq !== "number" || loading.has(sessionId)) return;
    set(loadingOlderAtom, new Set([...loading, sessionId]));
    try {
      const page = await fetchOlderPages(
        sessionId,
        beforeSeq,
        input.all === true,
      );
      input.beforeApply();
      set(applyTranscriptPageAtom, { sessionId, page });
    } finally {
      const next = new Set(get(loadingOlderAtom));
      next.delete(sessionId);
      set(loadingOlderAtom, next);
    }
  },
);
