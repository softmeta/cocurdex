import type { TFunction } from "i18next";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  type CompactRelativeTime,
  getCompactRelativeTime,
} from "./compact-relative-time";

interface SidebarItemPreviewProps {
  agentLabel?: string;
  roleName?: string;
  roleSummary?: string;
  timestamp: string;
  title: string;
}

function relativeTimeLabel(
  relative: CompactRelativeTime,
  t: TFunction<"common">,
) {
  switch (relative.unit) {
    case "now":
      return t("relativeTime.lastActiveNow");
    case "m":
      return t("relativeTime.lastActiveMinutes", { count: relative.count });
    case "h":
      return t("relativeTime.lastActiveHours", { count: relative.count });
    case "d":
      return t("relativeTime.lastActiveDays", { count: relative.count });
    case "mo":
      return t("relativeTime.lastActiveMonths", { count: relative.count });
    case "y":
      return t("relativeTime.lastActiveYears", { count: relative.count });
  }
}

export function SidebarItemPreview({
  agentLabel,
  roleName,
  roleSummary,
  timestamp,
  title,
}: SidebarItemPreviewProps) {
  const { t } = useTranslation("common");
  const relativeLabel = relativeTimeLabel(getCompactRelativeTime(timestamp), t);
  const runtimeLabel = roleSummary ?? agentLabel;

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <Text size="body" className="min-w-0 whitespace-normal">
        {title}
      </Text>
      <Text size="meta" tone="muted">
        {relativeLabel}
      </Text>
      {roleName ? (
        <Text size="meta" tone="muted" weight="medium">
          {roleName}
        </Text>
      ) : null}
      {runtimeLabel ? (
        <Text size="meta" tone="muted">
          {runtimeLabel}
        </Text>
      ) : null}
    </div>
  );
}

interface SidebarItemTooltipProps {
  agentLabel?: string;
  children: ReactElement;
  roleName?: string;
  roleSummary?: string;
  timestamp: string;
  title: string;
}

export function SidebarItemTooltip({
  agentLabel,
  children,
  roleName,
  roleSummary,
  timestamp,
  title,
}: SidebarItemTooltipProps) {
  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        align="center"
        hideArrow
        side="right"
        sideOffset={8}
        className="min-w-0 max-w-64 flex-col items-stretch gap-1 rounded-card bg-popover px-3 py-2 text-start text-body text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        <SidebarItemPreview
          agentLabel={agentLabel}
          roleName={roleName}
          roleSummary={roleSummary}
          timestamp={timestamp}
          title={title}
        />
      </TooltipContent>
    </Tooltip>
  );
}
