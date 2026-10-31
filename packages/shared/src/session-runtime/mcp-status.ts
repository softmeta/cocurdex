export type McpStatusKind =
  | "connected"
  | "connecting"
  | "disabled"
  | "failed"
  | "unknown";

export function getMcpStatusKind(status: string): McpStatusKind {
  const normalized = status.toLowerCase();
  if (normalized === "connected" || normalized === "ready") {
    return "connected";
  }
  if (
    normalized === "connecting" ||
    normalized === "pending" ||
    normalized === "starting"
  ) {
    return "connecting";
  }
  if (
    normalized === "disconnected" ||
    normalized.includes("fail") ||
    normalized.includes("error") ||
    normalized.includes("auth")
  ) {
    return "failed";
  }
  if (normalized.includes("disable")) {
    return "disabled";
  }
  return "unknown";
}
