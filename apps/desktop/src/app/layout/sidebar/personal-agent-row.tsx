import type { PersonalAgentRecord, SessionRecord } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  BellOff,
  BellRing,
  CircleDot,
  Copy,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuSeparator,
  ContextMenuTrigger,
  SidebarListRow,
  Text,
} from "@/components/ui";
import { permissionsBySessionAtom } from "@/features/agent/permission";
import { questionsBySessionAtom } from "@/features/agent/question";
import { useLatestReply } from "@/features/personal";
import {
  AgentRoleAvatar,
  canMarkSessionUnread,
  markSessionUnreadAtom,
  sessionResultAttentionAtom,
  unreadSessionIdsAtom,
  useAvatarGaze,
} from "@/features/sessions";
import { SessionTrailing } from "./session-sidebar-trailing";
import { SidebarContextMenuItem } from "./sidebar-context-menu-item";
import { SidebarOverflowTitle } from "./sidebar-overflow-title";

export interface PersonalAgentRowActions {
  onSelect(agent: PersonalAgentRecord): void;
  onEdit(agent: PersonalAgentRecord): void;
  onTogglePin(agent: PersonalAgentRecord): void;
  onToggleMute(agent: PersonalAgentRecord): void;
  onDuplicate(agent: PersonalAgentRecord): void;
  onDelete(agent: PersonalAgentRecord): void;
}

function useHomeSessionState(sessionId: string) {
  const permissions = useAtomValue(permissionsBySessionAtom)[sessionId];
  const questions = useAtomValue(questionsBySessionAtom)[sessionId];
  const isUnread = useAtomValue(unreadSessionIdsAtom).has(sessionId);
  const canMarkUnread = canMarkSessionUnread(
    useAtomValue(sessionResultAttentionAtom)[sessionId],
  );
  const needsAttention = Boolean(
    permissions?.some((permission) => permission.status === "pending") ||
      questions?.some((question) => question.status === "pending"),
  );
  return { canMarkUnread, isUnread, needsAttention };
}

function previewLine(content: string) {
  return content
    .replace(/[`*_>#~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function PersonalAgentRow({
  actions,
  agent,
  homeSession,
  isActive,
}: {
  actions: PersonalAgentRowActions;
  agent: PersonalAgentRecord;
  homeSession: SessionRecord | undefined;
  isActive: boolean;
}) {
  const { t } = useTranslation(["personal", "sessions"]);
  const gaze = useAvatarGaze();
  const { canMarkUnread, isUnread, needsAttention } = useHomeSessionState(
    agent.homeSessionId,
  );
  const markSessionUnread = useSetAtom(markSessionUnreadAtom);
  const isRunning = homeSession?.status === "running";
  const isMuted = agent.mutedAt !== null;
  const activityAt =
    homeSession?.lastMessageAt ?? homeSession?.updatedAt ?? agent.updatedAt;
  const reply = useLatestReply(
    agent.homeSessionId,
    homeSession?.lastMessageAt ?? null,
  );
  const preview = reply ? previewLine(reply.content) : "";
  const subtitle = isRunning
    ? t("roster.working")
    : preview || agent.role.description || "\u00a0";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarListRow
          className="h-auto gap-2.5 py-1.5 ps-0.5 pe-1.75"
          data-avatar-hover=""
          onPointerLeave={gaze.onPointerLeave}
          onPointerMove={gaze.onPointerMove}
          data-personal-agent-id={agent.id}
          data-session-id={agent.homeSessionId}
          isActive={isActive}
          onClick={() => actions.onSelect(agent)}
          render={<button type="button" />}
        >
          <AgentRoleAvatar role={agent.role} showAgent={false} size="lg" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <SidebarOverflowTitle>{agent.role.name}</SidebarOverflowTitle>
              {isMuted ? (
                <BellOff
                  aria-label={t("roster.muted")}
                  className="size-3.5 shrink-0 text-sidebar-fg-subtle"
                  role="img"
                />
              ) : null}
              <SessionTrailing
                isRunning={isRunning}
                isUnread={isUnread && !isActive && !isMuted}
                needsAttention={needsAttention}
                showTimestamp={homeSession?.lastMessageAt != null}
                timeFormat="clock"
                timestamp={activityAt}
              />
            </span>
            <Text
              className="truncate font-normal text-sidebar-fg-subtle"
              size="meta"
            >
              {subtitle}
            </Text>
          </span>
        </SidebarListRow>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-26">
        <SidebarContextMenuItem
          icon={Pencil}
          onClick={() => actions.onEdit(agent)}
        >
          {t("menu.edit")}
        </SidebarContextMenuItem>
        {agent.isDefault ? null : (
          <SidebarContextMenuItem
            icon={agent.pinnedAt ? PinOff : Pin}
            onClick={() => actions.onTogglePin(agent)}
          >
            {agent.pinnedAt ? t("menu.unpin") : t("menu.pin")}
          </SidebarContextMenuItem>
        )}
        <SidebarContextMenuItem
          icon={isMuted ? BellRing : BellOff}
          onClick={() => actions.onToggleMute(agent)}
        >
          {isMuted ? t("menu.unmute") : t("menu.mute")}
        </SidebarContextMenuItem>
        {!isActive && canMarkUnread ? (
          <SidebarContextMenuItem
            icon={CircleDot}
            onClick={() => markSessionUnread(agent.homeSessionId)}
          >
            {t("sessions:sidebar.markUnread")}
          </SidebarContextMenuItem>
        ) : null}
        <SidebarContextMenuItem
          icon={Copy}
          onClick={() => actions.onDuplicate(agent)}
        >
          {t("menu.duplicate")}
        </SidebarContextMenuItem>
        <ContextMenuSeparator />
        <SidebarContextMenuItem
          destructive
          icon={Trash2}
          onClick={() => actions.onDelete(agent)}
        >
          {t("menu.delete")}
        </SidebarContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
