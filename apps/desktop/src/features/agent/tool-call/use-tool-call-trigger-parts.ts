import type { AgentToolCallRecord } from "@cocurdex/shared";
import { useAtomValue } from "jotai";
import { sessionsAtom } from "@/features/sessions";
import { workspacesAtom } from "@/features/workspaces";
import { getToolCallTriggerParts, type ToolCallTense } from "./tool-call-utils";

function useSessionWorkingDirectory(sessionId: string) {
  const sessions = useAtomValue(sessionsAtom);
  const workspaces = useAtomValue(workspacesAtom);
  const session = sessions.find((candidate) => candidate.id === sessionId);
  if (!session) {
    return null;
  }
  const worktreePath = session.worktreePath?.trim();
  if (worktreePath) {
    return worktreePath;
  }
  const workspace = workspaces.find(
    (candidate) => candidate.id === session.workspaceId,
  );
  return workspace?.rootPaths[0] ?? null;
}

export function useToolCallTriggerParts(
  toolCall: AgentToolCallRecord,
  tense: ToolCallTense = "present",
) {
  const workingDirectory = useSessionWorkingDirectory(toolCall.sessionId);
  return getToolCallTriggerParts(toolCall, tense, workingDirectory);
}
