import type { AgentRoleRecord } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { Text } from "@/components/ui";
import { AgentRoleAvatar, useAvatarGaze } from "@/features/sessions";
import { cn } from "@/lib";

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
      <AgentRoleAvatar role={role} showAgent={false} size="lg" />
      <span
        className={cn(
          "-mt-1 max-w-full rounded-full bg-chat-surface-bubble px-2 py-0.5",
          onOpenOverview &&
            "group-hover:bg-accent group-focus-visible:bg-accent",
        )}
      >
        <Text className="block truncate" size="meta" weight="medium">
          {role.name}
        </Text>
      </span>
    </>
  );

  if (!onOpenOverview) {
    return (
      <div className="flex max-w-[min(60%,20rem)] flex-col items-center">
        {content}
      </div>
    );
  }

  return (
    <button
      aria-label={t("actions.showAssistantOverview")}
      className="app-no-drag group pointer-events-auto flex max-w-[min(60%,20rem)] cursor-pointer flex-col items-center rounded-panel px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-avatar-hover=""
      onClick={onOpenOverview}
      onPointerLeave={gaze.onPointerLeave}
      onPointerMove={gaze.onPointerMove}
      type="button"
    >
      {content}
    </button>
  );
}
