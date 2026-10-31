import type { AgentId, WorkspaceRecord } from "@cocurdex/shared";
import { Folder } from "lucide-react";
import type { ReactElement } from "react";
import { AppActivityTime, AppPreviewCardTooltipContent } from "@/components";
import { Text, Tooltip, TooltipTrigger } from "@/components/ui";
import {
  AgentIcon,
  AgentRoleAvatar,
  type AgentRoleAvatarSource,
} from "@/features/sessions";
import { WorkspaceRootsPreview } from "@/features/workspaces";
import { useSidebarScrolling } from "./sidebar-scrolling";

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
  const identityLabel = [role?.name, agentLabel].filter(Boolean).join(" · ");

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <Text size="body" weight="medium" className="min-w-0 whitespace-normal">
        {title}
      </Text>
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
      <AppActivityTime timestamp={timestamp} />
    </div>
  );
}

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
      <AppPreviewCardTooltipContent>
        <SidebarItemPreview
          agentId={agentId}
          agentLabel={agentLabel}
          role={role}
          roleSummary={roleSummary}
          timestamp={timestamp}
          title={title}
          workspaceName={workspaceName}
        />
      </AppPreviewCardTooltipContent>
    </Tooltip>
  );
}

interface WorkspaceItemTooltipProps {
  children: ReactElement;
  workspace: Pick<WorkspaceRecord, "rootPaths">;
}

export function WorkspaceItemTooltip({
  children,
  workspace,
}: WorkspaceItemTooltipProps) {
  const scrolling = useSidebarScrolling();

  return (
    <Tooltip disableHoverablePopup disabled={scrolling}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <AppPreviewCardTooltipContent>
        <WorkspaceRootsPreview workspace={workspace} />
      </AppPreviewCardTooltipContent>
    </Tooltip>
  );
}
