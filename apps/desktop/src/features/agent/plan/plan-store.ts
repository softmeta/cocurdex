import type { AgentEvent, AgentPlanUpdatedEvent } from "@cocurdex/shared";
import { atom } from "jotai";

export type SessionPlan = AgentPlanUpdatedEvent["plan"];

type PlansBySession = Record<string, SessionPlan>;
type PlanFlagsBySession = Record<string, true>;

export const plansBySessionAtom = atom<PlansBySession>({});

// Collapsed: header row stays docked, list is folded away. Sticky on purpose —
// `todo_write` fires often and re-expanding on every update would fight the
// user, who can reopen the list from the header at any time.
export const collapsedPlansBySessionAtom = atom<PlanFlagsBySession>({});

// Dismissed: panel is gone entirely. Cleared by the next plan update so a new
// `todo_write` brings the task list back.
export const dismissedPlansBySessionAtom = atom<PlanFlagsBySession>({});

function withoutSession(
  flags: PlanFlagsBySession,
  sessionId: string,
): PlanFlagsBySession {
  const { [sessionId]: _removed, ...next } = flags;

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
      dismissedPlansBySessionAtom,
      withoutSession(get(dismissedPlansBySessionAtom), sessionId),
    );
  },
);

export const togglePlanCollapsedForSessionAtom = atom(
  null,
  (get, set, sessionId: string) => {
    const current = get(collapsedPlansBySessionAtom);

    set(
      collapsedPlansBySessionAtom,
      current[sessionId]
        ? withoutSession(current, sessionId)
        : { ...current, [sessionId]: true },
    );
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

export const applyPlanEventAtom = atom(null, (get, set, event: AgentEvent) => {
  if (event.type !== "plan.updated") {
    return;
  }

  set(
    dismissedPlansBySessionAtom,
    withoutSession(get(dismissedPlansBySessionAtom), event.sessionId),
  );
  set(plansBySessionAtom, {
    ...get(plansBySessionAtom),
    [event.sessionId]: event.plan,
  });
});
