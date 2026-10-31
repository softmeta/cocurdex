import { useTranslation } from "react-i18next";
import { cn } from "@/lib";
import type { SkillDotState } from "./skill-library-model";

export function SkillStatusDot({ state }: { state: SkillDotState }) {
  const { t } = useTranslation("settings");
  const label = t(`skills.state.${state}`);
  return (
    <span
      aria-label={label}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        {
          ok: "bg-status-success",
          update: "bg-status-attention",
          problem: "bg-destructive",
        }[state],
      )}
      role="img"
      title={label}
    />
  );
}
