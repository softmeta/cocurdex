import type { SessionRecord } from "@cocurdex/shared";
import type { AgentSessionRuntimeState } from "./agent-runtime-store";

export function getActiveSessionModeId(
  session: Pick<SessionRecord, "sessionModeId"> | null | undefined,
  runtime: AgentSessionRuntimeState | null | undefined,
): string | null {
  return runtime?.mode?.currentModeId ?? session?.sessionModeId ?? null;
}
