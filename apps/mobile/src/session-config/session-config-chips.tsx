import type { SavedHost } from "@cocurdex/client-runtime";
import { useRouter } from "expo-router";
import { AgentIcon, usePermissionModeLabels } from "@/agents";
import { runtimeSummary, useRuntimeLabels } from "@/session-runtime";
import { ConfigTrigger } from "./config-trigger";
import { useSessionConfigState } from "./session-config-state";

export function SessionConfigChips({
  host,
  sessionId,
}: {
  host: SavedHost;
  sessionId: string;
}) {
  const router = useRouter();
  const runtimeLabels = useRuntimeLabels();
  const modeLabels = usePermissionModeLabels();
  const { session, agent, snapshot, axes } = useSessionConfigState(
    host,
    sessionId,
  );
  if (!session) return null;
  const summary = [
    snapshot?.modelName ?? agent?.label ?? session.agentType,
    ...(axes ? runtimeSummary(axes, runtimeLabels) : []),
  ].join(" · ");
  const mode = session.permissionMode;
  return (
    <ConfigTrigger
      testID="session-config-chip"
      leading={<AgentIcon agentId={session.agentType} size={14} />}
      summary={summary}
      mode={mode ? modeLabels[mode].label : null}
      onPress={() =>
        router.push({
          pathname: "/session-config/[hostId]/[sessionId]",
          params: { hostId: host.hostId, sessionId },
        })
      }
    />
  );
}
