import type { AgentId } from "@cocurdex/shared";
import type { ReactNode } from "react";
import { AgentIcon, AgentRoleAvatar } from "@/features/sessions";
import type { SessionRole } from "./use-session-role";

function SessionOwnerName({
  avatar,
  name,
}: {
  avatar: ReactNode;
  name: string;
}) {
  return (
    <span className="flex max-w-36 shrink-0 items-center gap-1.5">
      {avatar}
      <span className="min-w-0 truncate @max-lg/composer:sr-only">{name}</span>
      <span
        aria-hidden="true"
        className="shrink-0 opacity-70 @max-lg/composer:hidden"
      >
        ·
      </span>
    </span>
  );
}

export function SessionRoleName({ role }: { role: SessionRole }) {
  return (
    <SessionOwnerName
      avatar={<AgentRoleAvatar role={role} size="xs" />}
      name={role.name}
    />
  );
}

export function SessionAgentName({
  agentId,
  label,
}: {
  agentId: AgentId;
  label: string;
}) {
  return (
    <SessionOwnerName
      avatar={<AgentIcon agentId={agentId} className="size-3.5 shrink-0" />}
      name={label}
    />
  );
}
