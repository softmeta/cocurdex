import type { SessionTranscriptSync, SyncPullResult } from "@cocurdex/shared";
import type { getDefaultStore } from "jotai";
import {
  appendMessageAtom,
  bootstrapQueuedInputsAtom,
  discardQueuedInputAtom,
  hydratePendingPermissionsAtom,
  hydratePendingPlanApprovalsAtom,
  hydratePendingQuestionsAtom,
  loadSessionMessagesAtom,
  loadSessionPlanAtom,
  loadSessionToolCallsAtom,
  loadTurnStatsAtom,
} from "@/features/agent";
import { bootstrapSessionUsageAtom } from "@/features/composer";
import {
  mergeSessionChangesAtom,
  reconcileSessionsAtom,
} from "@/features/sessions";
import { loadTurnChangeSetsAtom } from "@/features/turn-workspace-changes";

type Store = ReturnType<typeof getDefaultStore>;

function applyTranscript(
  store: Store,
  sessionId: string,
  transcript: SessionTranscriptSync,
) {
  if (transcript.complete) {
    store.set(loadSessionMessagesAtom, {
      messages: transcript.messages,
      sessionId,
    });
  } else {
    for (const message of transcript.messages) {
      store.set(appendMessageAtom, message);
    }
    for (const messageId of transcript.deletedMessageIds) {
      store.set(discardQueuedInputAtom, { sessionId, messageId });
    }
  }
  for (const message of transcript.activeMessages) {
    store.set(appendMessageAtom, message);
  }
  store.set(loadTurnStatsAtom, transcript.turnStats);
  if (transcript.turnChangeSets) {
    store.set(loadTurnChangeSetsAtom, {
      changeSets: transcript.turnChangeSets,
      sessionId,
    });
  }
  if (transcript.complete || transcript.toolCalls.length > 0) {
    store.set(loadSessionToolCallsAtom, {
      sessionId,
      toolCalls: transcript.toolCalls,
    });
  }
  store.set(loadSessionPlanAtom, { sessionId, plan: transcript.plan });
}

export function applySyncResult(store: Store, result: SyncPullResult) {
  if (result.mode === "full") {
    store.set(reconcileSessionsAtom, result.sessions);
  } else {
    store.set(mergeSessionChangesAtom, {
      sessions: result.sessions,
      removedSessionIds: result.removedSessionIds,
    });
  }
  store.set(bootstrapQueuedInputsAtom, {
    inputs: result.queuedAgentInputs,
    messages: result.queuedMessages,
    pausedSessionIds: result.pausedQueueSessionIds,
  });
  store.set(bootstrapSessionUsageAtom, result.sessionUsage);
  store.set(hydratePendingPermissionsAtom, result.interactions.permissions);
  store.set(hydratePendingQuestionsAtom, result.interactions.questions);
  store.set(hydratePendingPlanApprovalsAtom, result.interactions.planApprovals);
  for (const [sessionId, transcript] of Object.entries(result.transcripts)) {
    if (transcript) applyTranscript(store, sessionId, transcript);
  }
}
