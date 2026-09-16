import type { AgentEvent, AgentQuestionRequestRecord } from "@cocurdex/shared";
import { atom } from "jotai";

type QuestionsBySession = Record<string, AgentQuestionRequestRecord[]>;

export const questionsBySessionAtom = atom<QuestionsBySession>({});

export const clearQuestionsForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(questionsBySessionAtom);
    const { [sessionId]: _removed, ...next } = current;

    set(questionsBySessionAtom, next);
  },
);

function upsertQuestion(
  questions: AgentQuestionRequestRecord[],
  nextQuestion: AgentQuestionRequestRecord,
) {
  const index = questions.findIndex(
    (question) => question.id === nextQuestion.id,
  );

  if (index === -1) {
    return [...questions, nextQuestion];
  }

  return questions.map((question, questionIndex) =>
    questionIndex === index ? nextQuestion : question,
  );
}

// Same reconciliation as hydratePendingPermissionsAtom: upsert the daemon's
// pending questions, drop locally-pending entries it no longer holds, and
// preserve answered records for transcript history.
export const hydratePendingQuestionsAtom = atom(
  null,
  (get, set, pending: AgentQuestionRequestRecord[]) => {
    const pendingIds = new Set(pending.map((record) => record.id));
    const next: QuestionsBySession = {};
    for (const [sessionId, records] of Object.entries(
      get(questionsBySessionAtom),
    )) {
      const kept = records.filter(
        (record) => record.status !== "pending" || pendingIds.has(record.id),
      );
      if (kept.length > 0) {
        next[sessionId] = kept;
      }
    }
    for (const record of pending) {
      next[record.sessionId] = upsertQuestion(
        next[record.sessionId] ?? [],
        record,
      );
    }
    set(questionsBySessionAtom, next);
  },
);

export const applyQuestionEventAtom = atom(
  null,
  (get, set, event: AgentEvent) => {
    if (
      event.type !== "question.requested" &&
      event.type !== "question.resolved"
    ) {
      return;
    }

    const questionsBySession = get(questionsBySessionAtom);
    const sessionQuestions = questionsBySession[event.sessionId] ?? [];

    set(questionsBySessionAtom, {
      ...questionsBySession,
      [event.sessionId]: upsertQuestion(sessionQuestions, event.question),
    });
  },
);
