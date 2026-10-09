import {
  deriveSessionAttention,
  type SessionAttentionAction,
  type SessionAttentionSnapshot,
} from "@cocurdex/shared";
import { atom } from "jotai";
import { desktopApi, logRendererDiagnostic } from "@/lib";

type SessionResultAttention = Pick<
  SessionAttentionSnapshot,
  "latestResultAt" | "lastVisitedAt" | "resultDisposition"
>;

const EMPTY_RESULT_ATTENTION: SessionResultAttention = {
  latestResultAt: null,
  lastVisitedAt: null,
  resultDisposition: "automatic",
};

export function isUnreadResult(attention: SessionResultAttention | undefined) {
  if (!attention) {
    return false;
  }
  return (
    deriveSessionAttention({
      ...attention,
      sessionStatus: "idle",
      activityKind: null,
      hasPendingPermission: false,
      hasPendingQuestion: false,
      hasPendingPlanApproval: false,
    }).attentionState === "completed-unread"
  );
}

export const sessionResultAttentionAtom = atom<
  Readonly<Record<string, SessionResultAttention>>
>({});

export function canMarkSessionUnread(
  attention: SessionResultAttention | undefined,
) {
  return Boolean(attention?.latestResultAt) && !isUnreadResult(attention);
}

export const unreadSessionIdsAtom = atom((get) => {
  const unread = new Set<string>();
  for (const [sessionId, attention] of Object.entries(
    get(sessionResultAttentionAtom),
  )) {
    if (isUnreadResult(attention)) {
      unread.add(sessionId);
    }
  }
  return unread;
});

export const loadSessionAttentionAtom = atom(null, async (_get, set) => {
  const snapshots = await desktopApi.listSessionAttention();
  set(
    sessionResultAttentionAtom,
    Object.fromEntries(
      snapshots.map((snapshot) => [
        snapshot.sessionId,
        {
          latestResultAt: snapshot.latestResultAt,
          lastVisitedAt: snapshot.lastVisitedAt,
          resultDisposition: snapshot.resultDisposition,
        },
      ]),
    ),
  );
});

export const recordSessionResultAtom = atom(
  null,
  (get, set, payload: { sessionId: string; at: string }) => {
    const current = get(sessionResultAttentionAtom);
    set(sessionResultAttentionAtom, {
      ...current,
      [payload.sessionId]: {
        ...(current[payload.sessionId] ?? EMPTY_RESULT_ATTENTION),
        latestResultAt: payload.at,
        resultDisposition: "automatic",
      },
    });
  },
);

function sendAttentionUpdate(
  sessionId: string,
  action: SessionAttentionAction,
  at: string,
) {
  void desktopApi
    .updateSessionAttention({ sessionId, action, at })
    .catch((error: unknown) => {
      logRendererDiagnostic("debug", "[SessionAttention] update failed", {
        sessionId,
        action,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

export const markSessionsVisitedAtom = atom(
  null,
  (get, set, sessionIds: readonly string[]) => {
    if (sessionIds.length === 0) {
      return;
    }
    const at = new Date().toISOString();
    const next = { ...get(sessionResultAttentionAtom) };
    for (const sessionId of sessionIds) {
      next[sessionId] = {
        ...(next[sessionId] ?? EMPTY_RESULT_ATTENTION),
        lastVisitedAt: at,
        resultDisposition: "automatic",
      };
      sendAttentionUpdate(sessionId, "visited", at);
    }
    set(sessionResultAttentionAtom, next);
  },
);

export const markSessionUnreadAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(sessionResultAttentionAtom)[sessionId];
    if (!current?.latestResultAt) {
      return;
    }
    set(sessionResultAttentionAtom, {
      ...get(sessionResultAttentionAtom),
      [sessionId]: { ...current, resultDisposition: "unread" },
    });
    sendAttentionUpdate(sessionId, "mark-unread", new Date().toISOString());
  },
);
