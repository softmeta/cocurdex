import type { TeamMemberRecord, TeamSnapshot } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import {
  AlertCircle,
  CircleDot,
  CircleStop,
  Loader2,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { agentLabels, selectSessionAtom, sessionsAtom } from "../session-store";
import { TeamMemberPeek } from "./team-member-peek";

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
  const agentLabelOf = (memberSessionId: string) => {
    const agentType = sessions.find(
      (session) => session.id === memberSessionId,
    )?.agentType;
    return agentType ? agentLabels[agentType] : null;
  };
  const active = team.status === "active";
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
      <div className="mb-1 flex h-6 items-center gap-2">
        <Users className="size-3.5 shrink-0 text-chat-fg-muted" />
        <span className="shrink-0 text-meta font-medium uppercase tracking-[0.18em] text-chat-fg-muted">
          {t("team.label")}
        </span>
        <span className="min-w-0 flex-1 truncate text-meta tabular-nums text-chat-fg-muted">
          {members.length}
        </span>
        {active ? (
          <Button
            className="h-6 px-2 text-chat-fg-muted"
            onClick={() => void desktopApi.stopTeam(team.id)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("team.stopAll")}
          </Button>
        ) : (
          <Text size="meta" tone="muted">
            {t("team.status.stopped")}
          </Text>
        )}
      </div>
      <ul className="flex max-h-72 flex-col overflow-y-auto overscroll-contain">
        {sortedMembers.map((member) => {
          const pendingPrompt =
            pendingPromptBySession[member.sessionId] ?? null;
          const expanded = expandedId === member.sessionId;
          return (
            <li className="flex flex-col" key={member.sessionId}>
              <div
                className={cn(
                  "group/member flex h-7 items-center gap-1 rounded-control ps-1 hover:bg-chat-surface-row-hover",
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
                    {member.name}
                  </Text>
                  <Text className="min-w-0" size="meta" tone="muted" truncate>
                    {agentLabelOf(member.sessionId)}
                  </Text>
                  <Text
                    className={cn(
                      "ms-auto shrink-0 pe-1",
                      pendingPrompt && "text-chat-status-pending-fg",
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
                  <Button
                    aria-label={t("team.stopMember", { name: member.name })}
                    className="text-chat-fg-muted opacity-0 group-hover/member:opacity-100 focus-visible:opacity-100"
                    onClick={() =>
                      void desktopApi.stopTeamMember({
                        teamId: team.id,
                        sessionId: member.sessionId,
                      })
                    }
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <CircleStop className="size-3.5" />
                  </Button>
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
    </section>
  );
}
