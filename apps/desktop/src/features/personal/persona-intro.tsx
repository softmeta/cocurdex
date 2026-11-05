import type { AgentRoleRecord } from "@cocurdex/shared";
import { Bell, Brain, CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { StageIdentity } from "@/features/composer";
import { AgentRoleAvatar } from "@/features/sessions";

export function PersonaIntro({
  role,
  onPickSuggestion,
}: {
  role: AgentRoleRecord;
  onPickSuggestion(text: string): void;
}) {
  const { t } = useTranslation("personal");
  const suggestions = [
    { icon: Bell, text: t("thread.suggestions.attention") },
    { icon: CalendarClock, text: t("thread.suggestions.brief") },
    { icon: Brain, text: t("thread.suggestions.memory") },
  ];

  return (
    <StageIdentity
      description={role.description?.trim() || t("thread.introFallback")}
      label={role.name}
      mark={<AgentRoleAvatar role={role} showAgent={false} size="xl" />}
      title={role.name}
    >
      <ul
        aria-label={t("thread.suggestions.label")}
        className="flex w-full max-w-md flex-col gap-0.5"
      >
        {suggestions.map(({ icon: Icon, text }) => (
          <li key={text}>
            <Button
              className="w-full justify-start font-normal"
              type="button"
              variant="ghost"
              onClick={() => onPickSuggestion(text)}
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="truncate">{text}</span>
            </Button>
          </li>
        ))}
      </ul>
    </StageIdentity>
  );
}
