import type {
  AgentEvent,
  AgentPlanStep,
  AgentPlanUpdatedEvent,
} from "@cocurdex/shared";
import { atom } from "jotai";

export type SessionPlan = AgentPlanUpdatedEvent["plan"];

type PlansBySession = Record<string, SessionPlan>;
type PlanFlagsBySession = Record<string, true>;

export const plansBySessionAtom = atom<PlansBySession>({});

export const collapsedPlansBySessionAtom = atom<PlanFlagsBySession>({});

export const autoCollapsedPlansBySessionAtom = atom<PlanFlagsBySession>({});

export const dismissedPlansBySessionAtom = atom<PlanFlagsBySession>({});

function withoutSession<T>(
  bySession: Record<string, T>,
  sessionId: string,
): Record<string, T> {
  const { [sessionId]: _removed, ...next } = bySession;

  return next;
}

export const togglePlanCollapsedForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const manual = get(collapsedPlansBySessionAtom);
    const auto = get(autoCollapsedPlansBySessionAtom);

    if (manual[sessionId] || auto[sessionId]) {
      set(collapsedPlansBySessionAtom, withoutSession(manual, sessionId));
      set(autoCollapsedPlansBySessionAtom, withoutSession(auto, sessionId));
      return;
    }

    set(collapsedPlansBySessionAtom, { ...manual, [sessionId]: true });
  },
);

export const dismissPlanForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    set(dismissedPlansBySessionAtom, {
      ...get(dismissedPlansBySessionAtom),
      [sessionId]: true,
    });
  },
);

export function resolvePlanStepStatus(
  status: AgentPlanStep["status"],
  isRunning: boolean,
): AgentPlanStep["status"] {
  return status === "in_progress" && !isRunning ? "pending" : status;
}

export function isPlanFinished(plan: SessionPlan): boolean {
  return (
    plan.steps.length > 0 &&
    plan.steps.every((step) => step.status === "completed")
  );
}

export function selectVisiblePlan(
  plan: SessionPlan | undefined,
  dismissed: boolean,
): SessionPlan | null {
  if (!plan || dismissed || isPlanFinished(plan)) {
    return null;
  }

  return plan;
}

export const loadSessionPlanAtom = atom(
  null,
  (get, set, input: { sessionId: string; plan: SessionPlan | null }) => {
    const plans = get(plansBySessionAtom);

    set(
      plansBySessionAtom,
      input.plan
        ? { ...plans, [input.sessionId]: input.plan }
        : withoutSession(plans, input.sessionId),
    );
  },
);

export const applyPlanEventAtom = atom(null, (get, set, event: AgentEvent) => {
  if (event.type === "plan.updated") {
    set(
      dismissedPlansBySessionAtom,
      withoutSession(get(dismissedPlansBySessionAtom), event.sessionId),
    );
    set(
      autoCollapsedPlansBySessionAtom,
      withoutSession(get(autoCollapsedPlansBySessionAtom), event.sessionId),
    );
    set(plansBySessionAtom, {
      ...get(plansBySessionAtom),
      [event.sessionId]: event.plan,
    });
    return;
  }

  if (event.type === "state.changed" && event.status !== "running") {
    const plan = get(plansBySessionAtom)[event.sessionId];
    if (plan && !isPlanFinished(plan)) {
      set(autoCollapsedPlansBySessionAtom, {
        ...get(autoCollapsedPlansBySessionAtom),
        [event.sessionId]: true,
      });
    }
  }
});
