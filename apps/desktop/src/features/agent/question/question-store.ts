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
