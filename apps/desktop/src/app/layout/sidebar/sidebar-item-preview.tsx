import type { AgentId, WorkspaceRecord } from "@cocurdex/shared";
import { Folder } from "lucide-react";
import type { ReactElement } from "react";
import { Text, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  AgentIcon,
  AgentRoleAvatar,
  type AgentRoleAvatarSource,
} from "@/features/sessions";
import { WorkspaceRootsPreview } from "@/features/workspaces";
import { useSidebarScrolling } from "./sidebar-scrolling";
import { useCompactAgeLabel } from "./use-compact-age-label";

interface SidebarItemPreviewProps {
  agentId?: AgentId;
  agentLabel?: string;
  role?: AgentRoleAvatarSource;
  roleSummary?: string;
  timestamp: string;
  title: string;
  workspaceName?: string;
}

export function SidebarItemPreview({
  agentId,
  agentLabel,
  role,
  roleSummary,
  timestamp,
  title,
  workspaceName,
}: SidebarItemPreviewProps) {
  const relativeLabel = useCompactAgeLabel(timestamp);
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
      {workspaceName ? (
        <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Folder className="size-3.5 shrink-0" />
          <Text size="meta" tone="muted" className="min-w-0 truncate">
            {workspaceName}
          </Text>
        </div>
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
  workspaceName?: string;
}

export function SidebarItemTooltip({
  agentId,
  agentLabel,
  children,
  role,
  roleSummary,
  timestamp,
  title,
  workspaceName,
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
          workspaceName={workspaceName}
        />
      </TooltipContent>
    </Tooltip>
  );
}

interface WorkspaceItemTooltipProps {
  children: ReactElement;
  workspace: Pick<WorkspaceRecord, "name" | "rootPaths">;
}

export function WorkspaceItemTooltip({
  children,
  workspace,
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
        <WorkspaceRootsPreview workspace={workspace} />
      </TooltipContent>
    </Tooltip>
  );
}
