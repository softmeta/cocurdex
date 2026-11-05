import type {
  AgentId,
  AgentPermissionMode,
  PushNotificationKind,
  RoutineAccess,
  RoutineDeliver,
} from "@cocurdex/shared";

const RESTRICTED_MODES: Partial<Record<AgentId, AgentPermissionMode>> = {
  "claude-agent": "claude-default",
  codex: "codex-read-only",
  opencode: "opencode-deny",
};

const FULL_MODES: Partial<Record<AgentId, AgentPermissionMode>> = {
  "claude-agent": "claude-bypass-permissions",
  codex: "codex-full-access",
  opencode: "opencode-allow",
};

export function routinePermissionMode(
  access: RoutineAccess,
  agentType: AgentId,
  roleDefault: AgentPermissionMode | undefined,
): AgentPermissionMode | undefined {
  if (access === "read-and-draft") {
    return RESTRICTED_MODES[agentType] ?? roleDefault;
  }
  if (access === "full") return FULL_MODES[agentType] ?? roleDefault;
  return roleDefault;
}

const NEEDS_ANSWER: readonly PushNotificationKind[] = [
  "approval",
  "question",
  "plan",
];

export function routinePushAllowed(
  deliver: RoutineDeliver,
  kind: PushNotificationKind,
) {
  if (deliver === "push" || NEEDS_ANSWER.includes(kind)) return true;
  return deliver === "inbox" && kind === "turnFailed";
}
