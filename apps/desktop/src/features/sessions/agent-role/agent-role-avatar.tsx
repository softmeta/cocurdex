import type {
  AgentId,
  AgentRoleAvatar as AgentRoleAvatarValue,
} from "@cocurdex/shared";
import { User } from "lucide-react";
import type { ReactNode } from "react";
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

export type AvatarSource = Omit<AgentRoleAvatarSource, "agentId"> &
  Partial<Pick<AgentRoleAvatarSource, "agentId">>;

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

const placeholderIconClassName: Record<AgentRoleAvatarSize, string> = {
  sm: "size-3",
  md: "size-3.5",
  lg: "size-4",
};

const badgeClassName: Record<AgentRoleAvatarSize, string> = {
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
};

export function AgentRoleAvatar({
  className,
  placeholder,
  role,
  showAgent = true,
  size = "sm",
}: {
  className?: string;
  placeholder?: ReactNode;
  role: AvatarSource;
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
      <AvatarGlyph
        placeholder={
          placeholder ?? <User className={placeholderIconClassName[size]} />
        }
        role={role}
      />
      {showAgent && role.agentId ? (
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

function AvatarGlyph({
  placeholder,
  role,
}: {
  placeholder: ReactNode;
  role: AvatarSource;
}) {
  if (role.avatar?.kind === "emoji") {
    return role.avatar.emoji;
  }
  if (!role.name.trim()) {
    return placeholder;
  }
  return agentRoleInitial(role.name);
}
