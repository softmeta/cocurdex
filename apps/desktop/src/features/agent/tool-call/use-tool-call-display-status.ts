import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { sessionsAtom } from "@/features/sessions";
import { getToolCallDisplayStatus } from "./tool-call-utils";

export function useToolCallDisplayStatus(toolCall: AgentToolCallRecord) {
  const sessions = useAtomValue(sessionsAtom);
  const isSessionRunning = sessions.some(
    (session) =>
      session.id === toolCall.sessionId && session.status === "running",
  );
  return getToolCallDisplayStatus(toolCall, isSessionRunning);
}
