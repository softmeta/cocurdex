import type { TeamMemberRecord, TeamSnapshot } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertCircle,
  ChevronDown,
  CircleDot,
  CircleStop,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppConfirmDialog } from "@/components";
import {
  Button,
  IconButton,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { AgentIconLabel } from "../agent-icon";
import {
  getAgentDisplayLabel,
  selectSessionAtom,
  sessionsAtom,
} from "../session-store";
import { TeamMemberPeek } from "./team-member-peek";
import { dismissedTeamIdsAtom, dismissTeamAtom } from "./team-panel-store";

function MemberStatusIcon({
  status,
  needsInput,
}: {
  status: TeamMemberRecord["status"];
  needsInput: boolean;
}) {
  if (needsInput) {
    return (
      <CircleDot className="size-3.5 shrink-0 text-chat-status-pending-fg" />
    );
  }
  if (status === "spawning" || status === "running") {
    return (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-chat-fg-muted" />
    );
  }
  if (status === "error") {
    return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
  }
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <span
        className={cn(
          "size-1.5 rounded-full bg-chat-fg-muted",
          status === "stopped" && "opacity-40",
        )}
      />
    </span>
  );
}

export function TeamPanel({
  sessionId,
  pendingPromptBySession,
}: {
  sessionId: string;
  pendingPromptBySession: Record<string, string>;
}) {
  const { t } = useTranslation("agent");
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null);
  const sessions = useAtomValue(sessionsAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(
    null,
  );
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const dismissedTeamIds = useAtomValue(dismissedTeamIdsAtom);
  const dismissTeam = useSetAtom(dismissTeamAtom);

  useMountEffect(() => {
    let cancelled = false;
    const load = () =>
      desktopApi.getTeam(sessionId).then((next) => {
        if (!cancelled) setSnapshot(next);
      });
    void load();
    const unsubscribe = desktopApi.onDataChanged((event) => {
      if (event.areas.includes("agent")) void load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  });

  if (!snapshot || snapshot.members.length === 0) return null;
  const { team, members } = snapshot;
  if (dismissedTeamIds.includes(team.id)) return null;
  const sessionOf = (memberSessionId: string) =>
    sessions.find((session) => session.id === memberSessionId);
  const agentLabelOf = (memberSessionId: string) => {
    const agentType = sessionOf(memberSessionId)?.agentType;
    return agentType ? (
      <AgentIconLabel agentId={agentType}>
        {getAgentDisplayLabel(agentType)}
      </AgentIconLabel>
    ) : null;
  };
  const active = team.status === "active";
  const collapsed = collapsedOverride ?? !active;
  const sortedMembers = [...members].sort(
    (left, right) =>
      Number(right.sessionId in pendingPromptBySession) -
      Number(left.sessionId in pendingPromptBySession),
  );

  return (
    <section
      aria-label={t("team.label")}
      className="w-full rounded-panel border border-chat-border bg-chat-surface-raised px-3 py-2 text-chat-fg shadow-chat-soft"
    >
      <div className="flex h-6 items-center gap-2">
        <button
          aria-expanded={!collapsed}
          className="group/header flex h-full min-w-0 flex-1 items-center gap-2 text-start"
          onClick={() => setCollapsedOverride(!collapsed)}
          type="button"
        >
          <Users className="size-3.5 shrink-0 text-chat-fg-muted" />
          <span className="shrink-0 text-meta font-medium uppercase tracking-[0.18em] text-chat-fg-muted">
            {t("team.label")}
          </span>
          <span className="shrink-0 text-meta tabular-nums text-chat-fg-muted">
            {members.length}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-chat-fg-muted transition-transform group-hover/header:text-chat-fg",
              collapsed && "-rotate-90",
            )}
          />
        </button>
        {active ? (
          <Button
            className="h-6 px-2 text-meta text-chat-fg-muted"
            onClick={() => setConfirmStopAll(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("team.endTeam")}
          </Button>
        ) : (
          <>
            <Text size="meta" tone="muted">
              {t("team.status.stopped")}
            </Text>
            <IconButton
              aria-label={t("team.dismiss")}
              className="text-chat-fg-muted"
              onClick={() => dismissTeam(team.id)}
              size="xs"
            >
              <X className="size-3.5" />
            </IconButton>
          </>
        )}
      </div>
      {collapsed ? null : (
        <ul className="mt-1 flex max-h-96 flex-col overflow-y-auto overscroll-contain">
          {sortedMembers.map((member) => {
            const pendingPrompt =
              pendingPromptBySession[member.sessionId] ?? null;
            const expanded = expandedId === member.sessionId;
            return (
              <li className="flex flex-col" key={member.sessionId}>
                <div
                  className={cn(
                    "group/member relative flex h-7 items-center rounded-control ps-1 hover:bg-chat-surface-row-hover",
                    pendingPrompt && "bg-chat-status-pending-bg",
                  )}
                >
                  <button
                    aria-expanded={expanded}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-start"
                    onClick={() =>
                      setExpandedId(expanded ? null : member.sessionId)
                    }
                    type="button"
                  >
                    <MemberStatusIcon
                      needsInput={Boolean(pendingPrompt)}
                      status={member.status}
                    />
                    <Text className="shrink-0" size="body" truncate>
                      {sessionOf(member.sessionId)?.title || member.name}
                    </Text>
                    <Text className="min-w-0" size="meta" tone="muted" truncate>
                      {agentLabelOf(member.sessionId)}
                    </Text>
                    <Text
                      className={cn(
                        "ms-auto shrink-0 pe-2",
                        pendingPrompt && "text-chat-status-pending-fg",
                        member.status !== "stopped" &&
                          "group-focus-within/member:invisible group-hover/member:invisible",
                      )}
                      size="meta"
                      tone="muted"
                    >
                      {pendingPrompt
                        ? t("team.needsInput")
                        : t(`team.status.${member.status}`)}
                    </Text>
                  </button>
                  {member.status !== "stopped" ? (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <IconButton
                            aria-label={t("team.stopMember", {
                              name: member.name,
                            })}
                            className="absolute end-0 text-chat-fg-muted opacity-0 group-hover/member:opacity-100 focus-visible:opacity-100"
                            onClick={() =>
                              void desktopApi.stopTeamMember({
                                teamId: team.id,
                                sessionId: member.sessionId,
                              })
                            }
                            size="xs"
                          >
                            <CircleStop className="size-3.5" />
                          </IconButton>
                        }
                      />
                      <TooltipContent>
                        {t("team.stopMember", { name: member.name })}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                {expanded ? (
                  <TeamMemberPeek
                    key={`${member.sessionId}:${member.status}`}
                    member={member}
                    onOpen={() => selectSession(member.sessionId)}
                    pendingPrompt={pendingPrompt}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <AppConfirmDialog
        cancelLabel={t("team.cancel")}
        confirmLabel={t("team.endTeam")}
        description={t("team.stopAllDescription", { count: members.length })}
        onConfirm={() => void desktopApi.stopTeam(team.id)}
        onOpenChange={setConfirmStopAll}
        open={confirmStopAll}
        title={t("team.stopAllTitle")}
        variant="destructive"
      />
    </section>
  );
}
