import type { AgentId } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  AgentIcon,
  AgentRoleAvatar,
  type AgentRoleAvatarSource,
} from "@/features/sessions";
import {
  type CompactRelativeTime,
  getCompactRelativeTime,
} from "./compact-relative-time";
import { useSidebarScrolling } from "./sidebar-scrolling";

interface SidebarItemPreviewProps {
  agentId?: AgentId;
  agentLabel?: string;
  role?: AgentRoleAvatarSource;
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
  agentId,
  agentLabel,
  role,
  roleSummary,
  timestamp,
  title,
}: SidebarItemPreviewProps) {
  const { t } = useTranslation("common");
  const relativeLabel = relativeTimeLabel(getCompactRelativeTime(timestamp), t);
  const identityLabel = [role?.name, agentLabel].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-3">
        <Text
          size="body"
          weight="medium"
          className="min-w-0 flex-1 whitespace-normal"
        >
          {title}
        </Text>
        <Text size="meta" tone="muted" className="shrink-0">
          {relativeLabel}
        </Text>
      </div>
      {identityLabel ? (
        <div className="flex min-w-0 items-center gap-1.5">
          {role ? <AgentRoleAvatar role={role} /> : null}
          {!role && agentId ? (
            <AgentIcon agentId={agentId} className="size-3.5" />
          ) : null}
          <Text size="meta" className="min-w-0 truncate">
            {identityLabel}
          </Text>
        </div>
      ) : null}
      {roleSummary ? (
        <Text size="meta" tone="muted" className="min-w-0">
          {roleSummary}
        </Text>
      ) : null}
    </div>
  );
}

const sidebarItemTooltipContentClassName =
  "min-w-0 max-w-72 flex-col items-stretch gap-1 rounded-card bg-popover px-3 py-2 text-start text-body text-popover-foreground shadow-md ring-1 ring-foreground/10";

interface SidebarItemTooltipProps {
  agentId?: AgentId;
  agentLabel?: string;
  children: ReactElement;
  role?: AgentRoleAvatarSource;
  roleSummary?: string;
  timestamp: string;
  title: string;
}

export function SidebarItemTooltip({
  agentId,
  agentLabel,
  children,
  role,
  roleSummary,
  timestamp,
  title,
}: SidebarItemTooltipProps) {
  const scrolling = useSidebarScrolling();

  return (
    <Tooltip disableHoverablePopup disabled={scrolling}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        align="center"
        hideArrow
        side="right"
        sideOffset={8}
        className={sidebarItemTooltipContentClassName}
      >
        <SidebarItemPreview
          agentId={agentId}
          agentLabel={agentLabel}
          role={role}
          roleSummary={roleSummary}
          timestamp={timestamp}
          title={title}
        />
      </TooltipContent>
    </Tooltip>
  );
}

interface WorkspaceItemTooltipProps {
  children: ReactElement;
  paths: string[];
  title: string;
}

export function WorkspaceItemTooltip({
  children,
  paths,
  title,
}: WorkspaceItemTooltipProps) {
  const scrolling = useSidebarScrolling();

  return (
    <Tooltip disableHoverablePopup disabled={scrolling}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        align="center"
        hideArrow
        side="right"
        sideOffset={8}
        className={sidebarItemTooltipContentClassName}
      >
        <div className="flex w-full min-w-0 flex-col gap-1">
          <Text size="body" className="min-w-0 whitespace-normal">
            {title}
          </Text>
          {paths.map((path) => (
            <Text
              className="min-w-0 break-all"
              key={path}
              size="meta"
              tone="muted"
            >
              {path}
            </Text>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
