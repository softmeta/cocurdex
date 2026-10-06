import path from "node:path";
import { RequestError } from "@agentclientprotocol/sdk";

const ACP_AUTH_REQUIRED_CODE = -32000;
const AUTH_REQUIRED_MESSAGE =
  /\b(?:authentication required|not (?:logged|signed) in|(?:log|sign) in again)\b/i;

export function isAcpAuthRequiredError(error: unknown) {
  return (
    error instanceof RequestError &&
    error.code === ACP_AUTH_REQUIRED_CODE &&
    AUTH_REQUIRED_MESSAGE.test(error.message)
  );
}

export class AcpProcessExitError extends Error {
  constructor(
    command: string,
    readonly exitCode: number | null,
    readonly signal: NodeJS.Signals | null,
    readonly stderrExcerpt: string,
  ) {
    const status = signal ? `signal ${signal}` : `code ${exitCode}`;
    super(
      appendAgentOutput(
        `${path.basename(command)} ACP process exited with ${status}.`,
        stderrExcerpt,
      ),
    );
    this.name = "AcpProcessExitError";
  }
}

function appendAgentOutput(message: string, stderrExcerpt: string) {
  return stderrExcerpt
    ? `${message}\n\nAgent output:\n${stderrExcerpt}`
    : message;
}

export function createAcpConnectionLostError(
  agentLabel: string,
  cause: unknown,
) {
  const stderrExcerpt =
    cause instanceof AcpProcessExitError ? cause.stderrExcerpt : "";
  return new Error(
    appendAgentOutput(
      `${agentLabel} stopped unexpectedly. Send your message again to continue.`,
      stderrExcerpt,
    ),
    { cause },
  );
}

export function createAcpSignInRequiredError(
  agentLabel: string,
  cause: unknown,
) {
  return new Error(
    `${agentLabel} needs you to sign in. Choose Sign in from the model menu, then send again.`,
    { cause },
  );
}
