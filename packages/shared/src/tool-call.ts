export interface GetToolCallResultInput {
  toolCallId: string;
}

export function isToolCallId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4096 &&
    /^[^\p{Cc}]+$/u.test(value)
  );
}
