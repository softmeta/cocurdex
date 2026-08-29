import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type { QuestionRequest } from "@opencode-ai/sdk/v2";
import {
  expectOpenCodeSuccess,
  formatOpenCodeError,
  logOpenCode,
  type OpenCodeRuntime,
} from "./opencode-runtime";

export async function resolveOpenCodeQuestion(
  payload: CreateAgentSessionPayload,
  runtime: OpenCodeRuntime,
  request: QuestionRequest,
) {
  if (!payload.requestQuestion) {
    await rejectOpenCodeQuestion(payload, runtime, request);
    return;
  }

  const answers: string[][] = [];
  for (const [index, question] of request.questions.entries()) {
    const answer = await payload.requestQuestion({
      id: `${request.id}:${index}`,
      sessionId: payload.session.id,
      providerId: "opencode",
      question: question.question,
      header: question.header,
      options: question.options,
      multiSelect: question.multiple,
    });

    if (!answer) {
      await rejectOpenCodeQuestion(payload, runtime, request);
      return;
    }

    answers.push([answer]);
  }

  await expectOpenCodeSuccess(
    runtime.clientV2.question.reply({
      requestID: request.id,
      directory: payload.workspaceRootPath,
      answers,
    }),
    "resolve question",
  );
}

async function rejectOpenCodeQuestion(
  payload: CreateAgentSessionPayload,
  runtime: OpenCodeRuntime,
  request: QuestionRequest,
) {
  try {
    await expectOpenCodeSuccess(
      runtime.clientV2.question.reject({
        requestID: request.id,
        directory: payload.workspaceRootPath,
      }),
      "reject question",
    );
  } catch (error) {
    logOpenCode("error", "Question rejection failed", {
      appSessionId: payload.session.id,
      openCodeSessionId: request.sessionID,
      requestId: request.id,
      error: formatOpenCodeError(error),
    });
  }
}
