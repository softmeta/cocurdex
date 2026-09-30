import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type { FormCreated, OpenCodeClient } from "@opencode/client";
import { formatOpenCodeError, logOpenCode } from "./opencode-runtime";

type OpenCodeForm = FormCreated["data"]["form"];
type OpenCodeFormField = OpenCodeForm["fields"][number];
type OpenCodeQuestionField = Extract<
  OpenCodeFormField,
  { type: "multiselect" | "string" }
>;

function isQuestionField(
  field: OpenCodeFormField,
): field is OpenCodeQuestionField {
  return field.type === "string" || field.type === "multiselect";
}

export async function resolveOpenCodeForm(
  payload: CreateAgentSessionPayload,
  client: OpenCodeClient,
  form: OpenCodeForm,
) {
  const requestQuestion = payload.requestQuestion;
  const fields = form.fields.filter(isQuestionField);
  if (
    !requestQuestion ||
    form.metadata?.kind !== "question" ||
    fields.length !== form.fields.length
  ) {
    await cancelOpenCodeForm(payload, client, form);
    return;
  }

  const answer: Record<string, string | string[]> = {};
  for (const [index, field] of fields.entries()) {
    const multiSelect = field.type === "multiselect";
    const response = await requestQuestion({
      id: `${form.id}:${index}`,
      sessionId: payload.session.id,
      providerId: "opencode",
      question: field.description ?? field.title ?? form.title,
      header: field.title,
      options: (field.options ?? []).map((option) => ({
        label: option.label,
        description: option.description ?? "",
      })),
      multiSelect,
    });

    if (!response) {
      await cancelOpenCodeForm(payload, client, form);
      return;
    }

    answer[field.key] = multiSelect ? response.split(", ") : response;
  }

  await client.session.form.reply({
    sessionID: form.sessionID,
    formID: form.id,
    answer,
  });
}

async function cancelOpenCodeForm(
  payload: CreateAgentSessionPayload,
  client: OpenCodeClient,
  form: OpenCodeForm,
) {
  try {
    await client.session.form.cancel({
      sessionID: form.sessionID,
      formID: form.id,
    });
  } catch (error) {
    logOpenCode("error", "Form cancellation failed", {
      appSessionId: payload.session.id,
      openCodeSessionId: form.sessionID,
      formId: form.id,
      error: formatOpenCodeError(error),
    });
  }
}
