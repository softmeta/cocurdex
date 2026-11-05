import { AgentRoleAvatar } from "@/features/sessions";
import type { SessionRole } from "./use-session-role";

export function SessionRoleName({ role }: { role: SessionRole }) {
  return (
    <span className="flex max-w-36 shrink-0 items-center gap-1.5">
      <AgentRoleAvatar className="size-4 text-2xs" role={role} showAgent />
      <span className="min-w-0 truncate @max-lg/composer:sr-only">
        {role.name}
      </span>
      <span
        aria-hidden="true"
        className="shrink-0 opacity-70 @max-lg/composer:hidden"
      >
        ·
      </span>
    </span>
  );
}
