import type {
  AgentId,
  AgentRoleAvatar as AgentRoleAvatarValue,
} from "@cocurdex/shared";
import { cn } from "@/lib";
import { AgentIcon } from "../agent-icon";
import {
  agentRoleAvatarColorClassName,
  agentRoleInitial,
  defaultAgentRoleAvatarColor,
} from "./agent-role-avatar-style";

export interface AgentRoleAvatarSource {
  id: string;
  name: string;
  agentId: AgentId;
  avatar: AgentRoleAvatarValue | null;
}

type AgentRoleAvatarSize = "sm" | "md" | "lg";

const sizeClassName: Record<AgentRoleAvatarSize, string> = {
  sm: "size-5 text-meta",
  md: "size-7 text-body",
  lg: "size-9 text-display",
};

const emojiSizeClassName: Record<AgentRoleAvatarSize, string> = {
  sm: "text-avatar-emoji-sm",
  md: "text-avatar-emoji-md",
  lg: "text-avatar-emoji-lg",
};

const badgeClassName: Record<AgentRoleAvatarSize, string> = {
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
};

export function AgentRoleAvatar({
  className,
  role,
  showAgent = true,
  size = "sm",
}: {
  className?: string;
  role: AgentRoleAvatarSource;
  showAgent?: boolean;
  size?: AgentRoleAvatarSize;
}) {
  const color = role.avatar?.color ?? defaultAgentRoleAvatarColor(role.id);

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none select-none",
        sizeClassName[size],
        role.avatar?.kind === "emoji" && emojiSizeClassName[size],
        agentRoleAvatarColorClassName[color],
        className,
      )}
    >
      {role.avatar?.kind === "emoji"
        ? role.avatar.emoji
        : agentRoleInitial(role.name)}
      {showAgent ? (
        <span className="absolute -end-0.5 -bottom-0.5 inline-flex rounded-full bg-popover p-px">
          <AgentIcon
            agentId={role.agentId}
            className={cn("text-foreground", badgeClassName[size])}
          />
        </span>
      ) : null}
    </span>
  );
}
