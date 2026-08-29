import type { AgentThinkingLevel } from "@cocurdex/shared";
import { useTranslation } from "react-i18next";
import { RuntimeAxisSubmenu } from "@/features/sessions";
import type { ThinkingLevelOption } from "./thinking-level";

/**
 * Thinking level as a row of the model menu, next to reasoning effort and
 * speed — the axes all belong to the same "how does this model run" surface.
 * Renders nothing when the selected model offers a single level (or none).
 */
export function ThinkingLevelSubmenu({
  level,
  options,
  onChange,
}: {
  level: AgentThinkingLevel | null;
  options: ThinkingLevelOption[];
  onChange?(level: AgentThinkingLevel): void;
}) {
  const { t } = useTranslation("sessions");

  if (options.length <= 1) {
    return null;
  }

  return (
    <RuntimeAxisSubmenu
      label={t("composer.thinkingLevel")}
      options={options.map((option) => ({
        isDefault: option.isDefault,
        value: option.level,
        // The agent's own name wins; otherwise fall back to our level names.
        label: option.label ?? t(`composer.thinkingLevels.${option.level}`),
        description: option.description,
      }))}
      value={level ?? ""}
      onValueChange={(value) => onChange?.(value as AgentThinkingLevel)}
    />
  );
}
