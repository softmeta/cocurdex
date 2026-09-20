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

// Collapsed: header row stays docked, list is folded away. Sticky on purpose —
// `todo_write` fires often and re-expanding on every update would fight the
// user, who can reopen the list from the header at any time.
export const collapsedPlansBySessionAtom = atom<PlanFlagsBySession>({});

// Auto-collapsed: the turn ended with unfinished steps, so the list folds to
// its status strip while the agent is paused. Unlike a manual collapse this is
// cleared by the next plan update — a resumed checklist re-expands on its own.
export const autoCollapsedPlansBySessionAtom = atom<PlanFlagsBySession>({});

// Dismissed: panel is gone entirely. Cleared by the next plan update so a new
// `todo_write` brings the task list back.
export const dismissedPlansBySessionAtom = atom<PlanFlagsBySession>({});

function withoutSession<T>(
  bySession: Record<string, T>,
  sessionId: string,
): Record<string, T> {
  const { [sessionId]: _removed, ...next } = bySession;

  return next;
}

export const clearPlanForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const { [sessionId]: _removedPlan, ...nextPlans } = get(plansBySessionAtom);

    set(plansBySessionAtom, nextPlans);
    set(
      collapsedPlansBySessionAtom,
      withoutSession(get(collapsedPlansBySessionAtom), sessionId),
    );
    set(
      autoCollapsedPlansBySessionAtom,
      withoutSession(get(autoCollapsedPlansBySessionAtom), sessionId),
    );
    set(
      dismissedPlansBySessionAtom,
      withoutSession(get(dismissedPlansBySessionAtom), sessionId),
    );
  },
);

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

// The task list outlives a single turn: an agent can carry the same checklist
// across several prompts, so it is only dropped once every step is done or
// when the session is rewound.
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
