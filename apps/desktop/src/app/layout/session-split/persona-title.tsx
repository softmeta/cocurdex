import type { AgentRoleRecord } from "@cocurdex/shared";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { AgentRoleAvatar, useAvatarGaze } from "@/features/sessions";

export function PersonaTitle({
  role,
  onOpenOverview,
}: {
  role: AgentRoleRecord;
  onOpenOverview?: () => void;
}) {
  const { t } = useTranslation("editor");
  const gaze = useAvatarGaze();
  const content = (
    <>
      <AgentRoleAvatar role={role} showAgent={false} size="md" />
      <Text className="ms-1.5 min-w-0 truncate" size="body" weight="medium">
        {role.name}
      </Text>
    </>
  );

  if (!onOpenOverview) {
    return (
      <div className="flex max-w-[min(60%,20rem)] items-center rounded-full bg-chat-surface-bubble py-1 ps-1 pe-2.5">
        {content}
      </div>
    );
  }

  return (
    <button
      aria-label={t("actions.showAssistantOverview")}
      className="app-no-drag group pointer-events-auto flex max-w-[min(60%,20rem)] cursor-pointer items-center rounded-full bg-chat-surface-bubble py-1 ps-1 pe-2.5 outline-none transition-colors hover:bg-chat-surface-row-hover focus-visible:bg-chat-surface-row-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      data-avatar-hover=""
      onClick={onOpenOverview}
      onPointerLeave={gaze.onPointerLeave}
      onPointerMove={gaze.onPointerMove}
      type="button"
    >
      {content}
      <span
        aria-hidden
        className="flex max-w-0 shrink-0 overflow-hidden opacity-0 transition-[max-width,opacity] group-hover:max-w-5 group-hover:opacity-100 group-focus-visible:max-w-5 group-focus-visible:opacity-100 motion-reduce:transition-none"
      >
        <ChevronRight className="ms-1 size-4 shrink-0 text-chat-fg-secondary rtl:rotate-180" />
      </span>
    </button>
  );
}
