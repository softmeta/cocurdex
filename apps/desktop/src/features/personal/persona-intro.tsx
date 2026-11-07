import type { AgentRoleRecord } from "@cocurdex/shared";
import { Bell, Brain, CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { AgentRoleAvatar } from "@/features/sessions";

export function PersonaGreetingActivity({ role }: { role: AgentRoleRecord }) {
  const { t } = useTranslation("agent");
  return (
    <div
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 text-body text-chat-fg-muted"
    >
      <AgentRoleAvatar role={role} showAgent={false} size="sm" />
      <span className="activity-shimmer truncate">
        {t("activity.thinking")}
      </span>
    </div>
  );
}

export function PersonaIntro({
  onPickSuggestion,
}: {
  onPickSuggestion(text: string): void;
}) {
  const { t } = useTranslation("personal");
  const suggestions = [
    { icon: Bell, text: t("thread.suggestions.attention") },
    { icon: CalendarClock, text: t("thread.suggestions.brief") },
    { icon: Brain, text: t("thread.suggestions.memory") },
  ];

  return (
    <ul
      aria-label={t("thread.suggestions.label")}
      className="mx-auto flex w-full max-w-md flex-col gap-0.5"
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
  );
}
