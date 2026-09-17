import type { SessionRecord } from "@cocurdex/shared";
import type { AgentSessionRuntimeState } from "./agent-runtime-store";

// Which session mode the composer should show. The stored value leads until the
// agent reports a mode of its own: agents that own plan mode leave it on their
// side (approved / abandoned plan) without Cocurdex asking, and the toggle has
// to follow that rather than keep claiming "plan".
export function getActiveSessionModeId(
  session: Pick<SessionRecord, "sessionModeId"> | null | undefined,
  runtime: AgentSessionRuntimeState | null | undefined,
): string | null {
  return runtime?.mode?.currentModeId ?? session?.sessionModeId ?? null;
}
