import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type { CodexAppServerRequest } from "./codex-app-server-client";
import { isRecord } from "./codex-app-server-events";

// Experimental app-server request asking the user to answer one or more
// questions mid-turn. Params carry a `questions` array; the response must map
// each question id to `{ answers: string[] }`.
const requestUserInputMethod = "item/tool/requestUserInput";

interface CodexUserInputQuestion {
  id: string;
  question: string;
  options: string[];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseQuestions(params: unknown): CodexUserInputQuestion[] {
  if (!isRecord(params) || !Array.isArray(params.questions)) {
    return [];
  }

  return params.questions.flatMap((question) => {
    if (!isRecord(question)) {
      return [];
    }

    const id = getString(question.id);
    const text = getString(question.question);

    if (!id || !text) {
      return [];
    }

    const options = Array.isArray(question.options)
      ? question.options.flatMap((option) => {
          const label = isRecord(option) ? getString(option.label) : null;
          return label ? [label] : [];
        })
      : [];

    return [{ id, question: text, options }];
  });
}

function formatQuestionText(question: CodexUserInputQuestion) {
  if (question.options.length === 0) {
    return question.question;
  }

  return `${question.question}\nOptions: ${question.options.join(" | ")}`;
}

export function canHandleCodexQuestionRequest(method: string) {
  return method === requestUserInputMethod;
}

export async function requestCodexQuestion(
  payload: CreateAgentSessionPayload,
  request: CodexAppServerRequest,
) {
  const questions = parseQuestions(request.params);

  if (questions.length === 0) {
    throw new Error(`Unsupported Codex question payload: ${request.method}`);
  }

  const answers: Record<string, { answers: string[] }> = {};

  for (const question of questions) {
    const answer = await payload.requestQuestion?.({
      id: question.id,
      sessionId: payload.session.id,
      providerId: "codex",
      question: formatQuestionText(question),
    });

    if (typeof answer === "string" && answer.length > 0) {
      answers[question.id] = { answers: [answer] };
    }
  }

  return { answers };
}
