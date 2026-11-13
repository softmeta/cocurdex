export const UNKNOWN_DAEMON_METHOD_MESSAGE = "Unknown daemon method";

export function isUnknownDaemonMethodError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === "FORBIDDEN" && error.message === UNKNOWN_DAEMON_METHOD_MESSAGE
  );
}
