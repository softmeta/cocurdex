import { AlarmClock, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IconButton, Text } from "@/components/ui";
import { usePendingFollowUps } from "@/features/personal";
import { requestDaemon } from "@/lib";
import { OverviewSection } from "./assistant-overview-sections";

export function AssistantFollowUps({ personaId }: { personaId: string }) {
  const { t, i18n } = useTranslation("personal");
  const { data: followUps, mutate } = usePendingFollowUps(personaId);
  if (!followUps || followUps.length === 0) return null;
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "short",
    timeStyle: "short",
  });
  const cancel = async (id: string) => {
    try {
      await requestDaemon("followUp.cancel", { id });
    } catch (error) {
      toast.error(
        t("overview.cancelFollowUpFailed", {
          defaultValue: "The follow-up could not be canceled",
        }),
        { description: error instanceof Error ? error.message : undefined },
      );
    }
    await mutate();
  };
  const cancelLabel = t("overview.cancelFollowUp", {
    defaultValue: "Cancel follow-up",
  });
  return (
    <OverviewSection
      title={t("overview.followUps", { defaultValue: "Follow-ups" })}
    >
      {followUps.map((followUp) => (
        <div
          key={followUp.id}
          data-follow-up-id={followUp.id}
          className="flex items-center gap-2 px-2.5 py-2"
        >
          <AlarmClock className="size-3.5 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-body">{followUp.note}</span>
            <Text className="truncate" size="meta" tone="muted">
              {format.format(new Date(followUp.dueAt))}
            </Text>
          </span>
          <IconButton
            size="xs"
            aria-label={cancelLabel}
            onClick={() => void cancel(followUp.id)}
          >
            <X />
          </IconButton>
        </div>
      ))}
    </OverviewSection>
  );
}
