import type {
  ScriptRunAgentRecord,
  ScriptRunRecord,
  ScriptRunSnapshot,
} from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { AlertCircle, Check, Loader2, Workflow, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import { selectSessionAtom } from "../session-store";
import { useScriptRuns } from "./use-script-runs";

function AgentStatusIcon({
  status,
}: {
  status: ScriptRunAgentRecord["status"];
}) {
  if (status === "running" || status === "queued") {
    return (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-chat-fg-muted" />
    );
  }
  if (status === "completed") {
    return <Check className="size-3.5 shrink-0 text-chat-fg-muted" />;
  }
  if (status === "failed") {
    return <AlertCircle className="size-3.5 shrink-0 text-destructive" />;
  }
  return <X className="size-3.5 shrink-0 text-chat-fg-muted" />;
}

function ScriptRunAgents({ run }: { run: ScriptRunRecord }) {
  const { t } = useTranslation("agent");
  const selectSession = useSetAtom(selectSessionAtom);
  const [snapshot, setSnapshot] = useState<ScriptRunSnapshot | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    const load = () =>
      desktopApi.getScriptRun(run.id).then((next) => {
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

  const agents = snapshot?.agents ?? [];
  if (agents.length === 0) {
    return (
      <Text className="ms-6 py-1" size="meta" tone="muted">
        {t("scriptRun.noAgents")}
      </Text>
    );
  }
  return (
    <ul className="ms-6 flex max-h-48 flex-col overflow-y-auto overscroll-contain">
      {agents.map((agent) => (
        <li key={agent.id}>
          <button
            className="flex h-7 w-full min-w-0 items-center gap-2 rounded-control px-1 text-start hover:bg-chat-surface-row-hover"
            onClick={() => selectSession(agent.sessionId)}
            type="button"
          >
            <AgentStatusIcon status={agent.status} />
            <Text className="min-w-0 flex-1" size="body" truncate>
              {agent.label}
            </Text>
            <Text className="shrink-0" size="meta" tone="muted">
              {t(`scriptRun.agentStatus.${agent.status}`)}
            </Text>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ScriptRunPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation("agent");
  const runs = useScriptRuns(sessionId).filter(
    (run) => run.status === "running",
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  return (
    <section
      aria-label={t("scriptRun.panelLabel")}
      className="w-full rounded-panel border border-chat-border bg-chat-surface-raised px-3 py-2 text-chat-fg shadow-chat-soft"
    >
      <div className="mb-1 flex h-6 items-center gap-2">
        <Workflow className="size-3.5 shrink-0 text-chat-fg-muted" />
        <span className="shrink-0 text-meta font-medium uppercase tracking-[0.18em] text-chat-fg-muted">
          {t("scriptRun.panelLabel")}
        </span>
      </div>
      <ul className="flex flex-col">
        {runs.map((run) => {
          const expanded = expandedId === run.id;
          return (
            <li className="flex flex-col" key={run.id}>
              <div className="flex h-7 items-center gap-1 rounded-control ps-1 hover:bg-chat-surface-row-hover">
                <button
                  aria-expanded={expanded}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 text-start"
                  onClick={() => setExpandedId(expanded ? null : run.id)}
                  type="button"
                >
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-chat-fg-muted" />
                  <Text className="min-w-0 flex-1" size="body" truncate>
                    {run.name}
                  </Text>
                  <Text
                    className="shrink-0 pe-1 tabular-nums"
                    size="meta"
                    tone="muted"
                  >
                    {t("scriptRun.agentCount", {
                      started: run.agentCount,
                      max: run.maxAgents,
                    })}
                  </Text>
                </button>
                <Button
                  className="h-6 px-2 text-chat-fg-muted"
                  onClick={() => void desktopApi.cancelScriptRun(run.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("scriptRun.cancel")}
                </Button>
              </div>
              {expanded ? <ScriptRunAgents key={run.id} run={run} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
