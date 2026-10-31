import type { AgentEvent, SessionExecutionTree } from "@cocurdex/shared";
import { useState } from "react";
import { desktopApi, taskApi, useMountEffect } from "@/lib";

export type ExecutionTreeState =
  | { status: "loading" }
  | { status: "ready"; tree: SessionExecutionTree | null }
  | { status: "error" };

const REFRESH_DELAY_MS = 400;

const structuralEvents = new Set<AgentEvent["type"]>([
  "session.upserted",
  "state.changed",
  "run.updated",
  "tool.started",
  "tool.updated",
  "tool.finished",
  "permission.requested",
  "permission.resolved",
  "question.requested",
  "question.resolved",
  "plan.approval.requested",
  "plan.approval.resolved",
  "plan.updated",
]);

export function useExecutionTree(sessionId: string) {
  const [state, setState] = useState<ExecutionTreeState>({
    status: "loading",
  });

  useMountEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = () =>
      desktopApi.getSessionExecutionTree(sessionId).then(
        (tree) => {
          if (!cancelled) setState({ status: "ready", tree });
        },
        () => {
          if (!cancelled) setState({ status: "error" });
        },
      );
    const scheduleLoad = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, REFRESH_DELAY_MS);
    };
    void load();
    const unsubscribeAgent = taskApi.onAgentEvent((event) => {
      if (structuralEvents.has(event.type)) scheduleLoad();
    });
    const unsubscribeData = desktopApi.onDataChanged((event) => {
      if (event.areas.includes("agent")) scheduleLoad();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribeAgent();
      unsubscribeData();
    };
  });

  return state;
}
