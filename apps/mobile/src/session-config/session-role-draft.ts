import type { SavedHost } from "@cocurdex/client-runtime";
import { roleDraftFromSession } from "@cocurdex/shared";
import { usePermissionModeLabels } from "@/agents";
import { runtimeSummary, useRuntimeLabels } from "@/session-runtime";
import { useSessionConfigState } from "./session-config-state";

export function useSessionRoleDraft(host: SavedHost, sessionId: string) {
  const runtimeLabels = useRuntimeLabels();
  const modeLabels = usePermissionModeLabels();
  const { session, agent, snapshot, axes } = useSessionConfigState(
    host,
    sessionId,
  );
  const mode = session?.permissionMode;
  const summary = [
    agent?.label,
    snapshot?.modelName,
    ...(axes ? runtimeSummary(axes, runtimeLabels) : []),
    mode ? modeLabels[mode].label : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { draft: session ? roleDraftFromSession(session) : null, summary };
}
