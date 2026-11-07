import type { AgentRoleRecord } from "@cocurdex/shared";
import { Text } from "@/components/ui";
import { AgentRoleAvatar } from "@/features/sessions";

export function PersonaTitle({ role }: { role: AgentRoleRecord }) {
  return (
    <div className="flex max-w-[min(60%,20rem)] flex-col items-center">
      <AgentRoleAvatar role={role} showAgent={false} size="lg" />
      <div className="-mt-1 max-w-full rounded-full bg-chat-surface-bubble px-2 py-0.5">
        <Text className="block truncate" size="meta" weight="medium">
          {role.name}
        </Text>
      </div>
    </div>
  );
}
