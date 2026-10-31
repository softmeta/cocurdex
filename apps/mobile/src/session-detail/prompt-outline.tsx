import { useTranslation } from "react-i18next";
import { HeaderButtons, useOptionSheet } from "@/ui";
import type { CondensedItem } from "./transcript-activity";
import { promptOutline } from "./transcript-jump";

const MIN_PROMPTS = 2;

export function PromptOutline({
  items,
  onJump,
}: {
  items: readonly CondensedItem[];
  onJump(id: string): void;
}) {
  const { t } = useTranslation("sessions");
  const openSheet = useOptionSheet();
  const prompts = promptOutline(items);
  const open = () =>
    openSheet({
      title: t("detail.prompts"),
      items: prompts.map((prompt, position) => ({
        key: prompt.id,
        testID: `transcript-prompt-${prompt.id}`,
        label: prompt.text || t("detail.imagePrompt"),
        supporting: t("detail.promptNumber", { number: position + 1 }),
        onPress: () => onJump(prompt.id),
      })),
    });
  return (
    <HeaderButtons
      items={[
        {
          key: "prompts",
          icon: { ios: "list.bullet", android: "toc" },
          label: t("detail.prompts"),
          hidden: prompts.length < MIN_PROMPTS,
          onPress: open,
        },
      ]}
    />
  );
}
