import type { CollaborationModeKind, SessionRecord } from "@cocurdex/shared";
import type { AgentSessionRuntimeState } from "./agent-runtime-store";

// ACP session-mode id an agent reports while it is planning. Grok Build's mode
// ids are the snake-cased `SessionMode` variants (`default` / `plan` / `ask`).
const PLAN_MODE_ID = "plan";

// Which collaboration mode the composer should show. The stored session value
// leads until the agent reports a mode of its own: agents that own plan mode
// leave it on their side (approved / abandoned plan) without Cocurdex asking,
// and the toggle has to follow that rather than keep claiming "plan".
export function getActiveCollaborationMode(
  session: Pick<SessionRecord, "collaborationMode"> | null | undefined,
  runtime: AgentSessionRuntimeState | null | undefined,
): CollaborationModeKind {
  const reportedModeId = runtime?.mode?.currentModeId;

  if (!reportedModeId) {
    return session?.collaborationMode ?? "default";
  }

  return reportedModeId === PLAN_MODE_ID ? "plan" : "default";
}
