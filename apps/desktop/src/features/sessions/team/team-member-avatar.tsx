import type { AgentRoleRecord } from "@cocurdex/shared";
import { AgentRoleAvatar } from "../agent-role/agent-role-avatar";

export function TeamMemberAvatar({
  className,
  role,
  size = "sm",
}: {
  className?: string;
  role: AgentRoleRecord | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <AgentRoleAvatar
      className={className}
      role={role ?? { id: "", name: "", avatar: null }}
      size={size}
    />
  );
}
