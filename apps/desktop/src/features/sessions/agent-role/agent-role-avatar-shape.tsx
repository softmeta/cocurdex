import {
  AGENT_ROLE_AVATAR_FACE_FEATURES,
  AGENT_ROLE_AVATAR_SHAPE_PATHS,
  AGENT_ROLE_AVATAR_VIEWBOX,
  type AgentRoleAvatarColor,
  type AgentRoleAvatarFace,
  type AgentRoleAvatarShape,
} from "@cocurdex/shared";
import { cn } from "@/lib";
import { agentRoleAvatarFillClassName } from "./agent-role-avatar-style";

export function AgentRoleAvatarShapeGlyph({
  className,
  color,
  face,
  shape,
}: {
  className?: string;
  color: AgentRoleAvatarColor;
  face: AgentRoleAvatarFace;
  shape: AgentRoleAvatarShape;
}) {
  return (
    <svg
      aria-hidden
      className={cn(
        "size-full shrink-0",
        agentRoleAvatarFillClassName[color],
        className,
      )}
      viewBox={`0 0 ${AGENT_ROLE_AVATAR_VIEWBOX} ${AGENT_ROLE_AVATAR_VIEWBOX}`}
    >
      <path d={AGENT_ROLE_AVATAR_SHAPE_PATHS[shape]} fill="currentColor" />
      {AGENT_ROLE_AVATAR_FACE_FEATURES[face].map((feature) =>
        feature.kind === "dot" ? (
          <circle
            className="fill-role-avatar-face"
            cx={feature.cx}
            cy={feature.cy}
            key={`${feature.cx}:${feature.cy}`}
            r={feature.r}
          />
        ) : (
          <path
            className="stroke-role-avatar-face"
            d={feature.d}
            fill="none"
            key={feature.d}
            strokeLinecap="round"
            strokeWidth={feature.width}
          />
        ),
      )}
    </svg>
  );
}
