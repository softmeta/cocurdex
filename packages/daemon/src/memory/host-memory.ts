import { codexShellReachesNetwork } from "@cocurdex/agent-adapters";
import type { SessionRecord } from "@cocurdex/shared";

export function hostShellReachesMemory(
  session: Pick<SessionRecord, "agentType" | "permissionMode">,
) {
  if (session.agentType === "codex") {
    return codexShellReachesNetwork(session.permissionMode);
  }
  return true;
}
