import type { ClaudeStreamMessage } from "./claude-message-mapper";

export interface ClaudeResultError {
  message: string;
  authenticationFailure: boolean;
}

const AUTHENTICATION_FAILURE_PATTERN =
  /invalid api key|\/login|not logged in|authentication|unauthorized|oauth/i;

export function isAuthenticationFailureText(text: string) {
  return AUTHENTICATION_FAILURE_PATTERN.test(text);
}

export function getClaudeResultError(
  message: ClaudeStreamMessage,
): ClaudeResultError | null {
  if (message.type !== "result") {
    return null;
  }

  const result = message as {
    type: "result";
    subtype?: unknown;
    is_error?: unknown;
    result?: unknown;
    errors?: unknown;
  };

  const subtype = typeof result.subtype === "string" ? result.subtype : "";
  const isError = result.is_error === true || subtype.startsWith("error");
  if (!isError) {
    return null;
  }

  const errorsText = Array.isArray(result.errors)
    ? result.errors.filter((entry) => typeof entry === "string").join("\n")
    : "";
  const resultText =
    typeof result.result === "string" && result.result
      ? result.result
      : errorsText || `Claude turn failed (${subtype || "unknown error"})`;

  return {
    message: resultText,
    authenticationFailure: isAuthenticationFailureText(resultText),
  };
}
