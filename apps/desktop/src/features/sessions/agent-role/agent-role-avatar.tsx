import {
  type AgentId,
  type AgentRoleAvatar as AgentRoleAvatarValue,
  agentRoleInitial,
  resolveAgentRoleAvatar,
} from "@cocurdex/shared";
import { User } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib";
import { AgentIcon } from "../agent-icon";
import { AgentRoleAvatarShapeGlyph } from "./agent-role-avatar-shape";
import { agentRoleAvatarColorClassName } from "./agent-role-avatar-style";

export interface AgentRoleAvatarSource {
  id: string;
  name: string;
  agentId: AgentId;
  avatar: AgentRoleAvatarValue | null;
}

export type AvatarSource = Omit<AgentRoleAvatarSource, "agentId"> &
  Partial<Pick<AgentRoleAvatarSource, "agentId">>;

type AgentRoleAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClassName: Record<AgentRoleAvatarSize, string> = {
  xs: "size-4 text-2xs",
  sm: "size-5 text-meta",
  md: "size-7 text-body",
  lg: "size-9 text-display",
  xl: "size-14 text-title",
};

const emojiSizeClassName: Record<AgentRoleAvatarSize, string> = {
  xs: "text-avatar-emoji-sm",
  sm: "text-avatar-emoji-sm",
  md: "text-avatar-emoji-md",
  lg: "text-avatar-emoji-lg",
  xl: "text-avatar-emoji-xl",
};

const placeholderIconClassName: Record<AgentRoleAvatarSize, string> = {
  xs: "size-2.5",
  sm: "size-3",
  md: "size-3.5",
  lg: "size-4",
  xl: "size-6",
};

const badgeClassName: Record<AgentRoleAvatarSize, string> = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3.5",
  xl: "size-4",
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
  const avatar = resolveAgentRoleAvatar(role);
  const isShape = avatar.kind === "shape";

  return (
    <span
      aria-hidden
      data-avatar=""
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-medium leading-none select-none",
        sizeClassName[size],
        avatar.kind === "emoji" && emojiSizeClassName[size],
        !isShape && agentRoleAvatarColorClassName[avatar.color],
        className,
      )}
    >
      {isShape ? (
        <AgentRoleAvatarShapeGlyph
          color={avatar.color}
          face={avatar.face}
          shape={avatar.shape}
        />
      ) : (
        <AvatarGlyph
          avatar={avatar}
          name={role.name}
          placeholder={
            placeholder ?? <User className={placeholderIconClassName[size]} />
          }
        />
      )}
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
  avatar,
  name,
  placeholder,
}: {
  avatar: AgentRoleAvatarValue;
  name: string;
  placeholder: ReactNode;
}) {
  if (avatar.kind === "emoji") {
    return avatar.emoji;
  }
  if (!name.trim()) {
    return placeholder;
  }
  return agentRoleInitial(name);
}
