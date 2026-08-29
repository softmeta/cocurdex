import type {
  AgentPermissionMode,
  CollaborationModeKind,
} from "@cocurdex/shared";

export function getClaudePermissionMode(
  permissionMode: AgentPermissionMode | undefined,
  collaborationMode: CollaborationModeKind,
) {
  if (collaborationMode === "plan") {
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
