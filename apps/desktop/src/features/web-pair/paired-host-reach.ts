import { requestDaemon } from "@/lib";

export type PairedHostFailure =
  | "offline"
  | "pending"
  | "revoked"
  | "unreachable";

const REACH_TIMEOUT_MS = 15_000;

function failureOf(error: unknown): PairedHostFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "UNAUTHORIZED") return "revoked";
  if (code === "UNAVAILABLE") return "offline";
  if (code === "PENDING_APPROVAL") return "pending";
  return "unreachable";
}

export async function reachPairedHost(): Promise<PairedHostFailure | null> {
  try {
    await requestDaemon("daemon.status", undefined, {
      timeoutMs: REACH_TIMEOUT_MS,
    });
    return null;
  } catch (error) {
    return failureOf(error);
  }
}
