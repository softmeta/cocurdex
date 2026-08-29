import type {
  AgentPermissionOption,
  AgentPermissionOptionKind,
} from "@cocurdex/shared";

const optionLabels: Record<AgentPermissionOptionKind, string> = {
  allow_always: "Always allow",
  allow_once: "Allow once",
  reject_always: "Reject always",
  reject_once: "Reject",
};

export function createPermissionOptions(
  kinds: AgentPermissionOptionKind[],
): AgentPermissionOption[] {
  return kinds.map((kind) => ({
    id: kind,
    kind,
    label: optionLabels[kind],
  }));
}
