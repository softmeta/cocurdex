import type { TeamMemberRecord, TeamSnapshot } from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { AlertCircle, Check, Loader2, Square, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import { selectSessionAtom, sessionsAtom } from "../session-store";

const statusIcon: Partial<
  Record<TeamMemberRecord["status"], typeof Check | typeof Loader2>
> = {
  spawning: Loader2,
  running: Loader2,
  idle: Check,
  error: AlertCircle,
};

function MemberStatusIcon({ status }: { status: TeamMemberRecord["status"] }) {
  const Icon = statusIcon[status];
  if (!Icon) return null;
  const spinning = status === "spawning" || status === "running";
  if (spinning) {
    return <Icon className="size-3.5 shrink-0 animate-spin" />;
  }
  return <Icon className="size-3.5 shrink-0" />;
}

export function TeamPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("agent");
  const [snapshot, setSnapshot] = useState<TeamSnapshot | null>(null);
  const sessions = useAtomValue(sessionsAtom);
  const selectSession = useSetAtom(selectSessionAtom);

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
  const agentTypeOf = (memberSessionId: string) =>
    sessions.find((session) => session.id === memberSessionId)?.agentType ??
    null;
  const active = team.status === "active";

  return (
    <section
      aria-label={t("team.label")}
      className="w-full rounded-panel border border-chat-border bg-chat-surface-raised px-3 py-2 text-chat-fg shadow-chat-soft"
    >
      <div className="mb-1 flex items-center gap-2">
        <Users className="size-3.5 shrink-0 text-chat-fg-muted" />
        <Text
          className="flex-1 uppercase tracking-[0.18em] text-chat-fg-muted"
          size="meta"
          weight="medium"
        >
          {t("team.label")}
        </Text>
        {active ? (
          <Button
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
      <ul className="flex flex-col">
        {members.map((member) => (
          <li
            className="flex h-7 items-center gap-2 rounded-control px-1 hover:bg-chat-surface-row-hover"
            key={member.sessionId}
          >
            <MemberStatusIcon status={member.status} />
            <button
              className="flex min-w-0 flex-1 items-center gap-2 text-start"
              onClick={() => selectSession(member.sessionId)}
              type="button"
            >
              <Text size="body" truncate>
                {member.name}
              </Text>
              <Text size="meta" tone="muted" truncate>
                {agentTypeOf(member.sessionId)}
              </Text>
              <Text className="ms-auto shrink-0" size="meta" tone="muted">
                {t(`team.status.${member.status}`)}
              </Text>
            </button>
            {member.status !== "stopped" ? (
              <Button
                aria-label={t("team.stopMember", { name: member.name })}
                onClick={() =>
                  void desktopApi.stopTeamMember({
                    teamId: team.id,
                    sessionId: member.sessionId,
                  })
                }
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Square className="size-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
