import { type AgentPermissionMode, isPlanModeId } from "@cocurdex/shared";

export function getClaudePermissionMode(
  permissionMode: AgentPermissionMode | undefined,
  sessionModeId: string | null | undefined,
) {
  if (isPlanModeId(sessionModeId)) {
    return "plan";
  }

  switch (permissionMode) {
    case "claude-accept-edits":
      return "acceptEdits";
    case "claude-auto":
      return "auto";
    case "claude-plan":
      return "plan";
    case "claude-bypass-permissions":
      return "bypassPermissions";
    default:
      return "default";
  }
}
