import type { AgentRoleRecord, TeamTemplateMember } from "@cocurdex/shared";
import { User } from "lucide-react";
import { AgentRoleAvatar } from "../agent-role/agent-role-avatar";

export function TeamMemberAvatar({
  className,
  member,
  role,
  size = "sm",
}: {
  className?: string;
  member: Pick<TeamTemplateMember, "name">;
  role: AgentRoleRecord | null;
  size?: "sm" | "md" | "lg";
}) {
  if (role) {
    return (
      <AgentRoleAvatar
        className={className}
        role={role}
        showAgent={false}
        size={size}
      />
    );
  }
  return (
    <AgentRoleAvatar
      className={className}
      placeholder={<User className="size-3.5" />}
      role={{ id: member.name, name: member.name, avatar: null }}
      size={size}
    />
  );
}
