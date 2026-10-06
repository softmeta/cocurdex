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

export function createAcpConnectionLostError(
  agentLabel: string,
  cause: unknown,
) {
  return new Error(
    `${agentLabel} stopped unexpectedly. Send your message again to continue.`,
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
