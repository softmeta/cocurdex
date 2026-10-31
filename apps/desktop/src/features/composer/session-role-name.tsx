import { AgentRoleAvatar } from "@/features/sessions";
import { composerFooterControlClassName } from "./chat-composer-layout";
import type { SessionRole } from "./use-session-role";

export function SessionRoleName({
  agentLabel,
  role,
}: {
  agentLabel?: string;
  role: SessionRole;
}) {
  return (
    <span
      className={composerFooterControlClassName(
        "inline-flex max-w-56 items-center gap-1.5",
      )}
      title={agentLabel ? `${role.name} · ${agentLabel}` : undefined}
    >
      <AgentRoleAvatar
        className="size-4 text-2xs"
        role={role}
        showAgent={Boolean(agentLabel)}
      />
      <span className="truncate @max-lg/composer:sr-only">{role.name}</span>
      {agentLabel ? (
        <span className="shrink-0 opacity-70 @max-lg/composer:sr-only">
          · {agentLabel}
        </span>
      ) : null}
    </span>
  );
}
