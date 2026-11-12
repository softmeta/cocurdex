import {
  ROUTINE_REPORT_STATUSES,
  ROUTINE_REPORT_SUMMARY_MAX_LENGTH,
  type RoutineReport,
} from "@cocurdex/shared";

export const reportStatusSchema = {
  type: "string",
  enum: [...ROUTINE_REPORT_STATUSES],
  description:
    "ready: a result to read; dropped: nothing worth telling this time; needs_you: the user has to decide or answer; blocked: something outside your control stopped you; failed: you could not do the task",
};

function reportText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${label} cannot be empty`);
  if (text.length > ROUTINE_REPORT_SUMMARY_MAX_LENGTH) {
    throw new Error(
      `${label} is longer than ${ROUTINE_REPORT_SUMMARY_MAX_LENGTH} characters`,
    );
  }
  return text;
}

export function parseReport(input: Record<string, unknown>): RoutineReport {
  const status = ROUTINE_REPORT_STATUSES.find(
    (value) => value === input.status,
  );
  if (!status) {
    throw new Error(
      `status must be one of ${ROUTINE_REPORT_STATUSES.join(", ")}`,
    );
  }
  const question =
    status === "needs_you" ? reportText(input.question, "question") : null;
  return { status, summary: reportText(input.summary, "summary"), question };
}
