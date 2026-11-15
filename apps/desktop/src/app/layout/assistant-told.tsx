import { MessageSquareText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { IconButton, Text } from "@/components/ui";
import { useToldItems } from "@/features/personal";
import { requestDaemon } from "@/lib";
import { OverviewSection } from "./assistant-overview-sections";

export function AssistantTold({ personaId }: { personaId: string }) {
  const { t } = useTranslation("personal");
  const { data: items, mutate } = useToldItems(personaId);
  if (!items || items.length === 0) return null;
  const forget = async (item: string) => {
    try {
      await mutate(
        requestDaemon("personalAgent.told.forget", { id: personaId, item }),
        { revalidate: false },
      );
    } catch (error) {
      toast.error(
        t("overview.forgetToldFailed", {
          defaultValue: "The item could not be removed",
        }),
        { description: error instanceof Error ? error.message : undefined },
      );
    }
  };
  const forgetLabel = t("overview.forgetTold", {
    defaultValue: "Remove from what it told you",
  });
  return (
    <OverviewSection
      title={t("overview.told", { defaultValue: "Already told you" })}
    >
      <Text className="px-2 pt-2" size="meta" tone="muted">
        {t("overview.toldHint", {
          defaultValue:
            "The assistant reads this before each reply so it does not repeat itself.",
        })}
      </Text>
      {items.map((item) => (
        <div key={item} className="flex items-center gap-2 px-2.5 py-2">
          <MessageSquareText className="size-3.5 shrink-0" />
          <span className="line-clamp-3 min-w-0 flex-1 text-body">{item}</span>
          <IconButton
            size="xs"
            aria-label={`${forgetLabel}: ${item}`}
            onClick={() => void forget(item)}
          >
            <X />
          </IconButton>
        </div>
      ))}
    </OverviewSection>
  );
}
