import type { AgentEvent } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
// Imported from the source file, not the feature barrel: the barrel pulls in
// the app shell and its browser-only preference bootstrap.
import {
  applyPlanEventAtom,
  collapsedPlansBySessionAtom,
  dismissedPlansBySessionAtom,
  dismissPlanForSessionAtom,
  plansBySessionAtom,
  selectVisiblePlan,
  togglePlanCollapsedForSessionAtom,
} from "@/features/agent/plan/plan-store";

const updateEvent: AgentEvent = {
  type: "plan.updated",
  sessionId: "session-1",
  plan: {
    explanation: "Check first",
    steps: [
      { step: "Inspect files", status: "completed" },
      { step: "Patch UI", status: "in_progress" },
    ],
    updatedAt: "2026-05-02T12:00:00.000Z",
  },
};

const finishedPlan = {
  explanation: "Done",
  steps: [{ step: "Inspect files", status: "completed" as const }],
  updatedAt: "2026-05-02T12:05:00.000Z",
};

describe("plan store", () => {
  it("upserts the latest plan for a session", () => {
    const store = createStore();

    store.set(applyPlanEventAtom, updateEvent);

    expect(store.get(plansBySessionAtom)["session-1"]).toEqual(
      updateEvent.plan,
    );
  });

  it("restores a dismissed panel on the next plan update", () => {
    const store = createStore();

    store.set(applyPlanEventAtom, updateEvent);
    store.set(dismissPlanForSessionAtom, "session-1");

    expect(store.get(dismissedPlansBySessionAtom)["session-1"]).toBe(true);

    store.set(applyPlanEventAtom, updateEvent);

    expect(store.get(dismissedPlansBySessionAtom)["session-1"]).toBeUndefined();
  });

  it("keeps the collapsed state across plan updates", () => {
    const store = createStore();

    store.set(togglePlanCollapsedForSessionAtom, "session-1");
    store.set(applyPlanEventAtom, updateEvent);

    expect(store.get(collapsedPlansBySessionAtom)["session-1"]).toBe(true);

    store.set(togglePlanCollapsedForSessionAtom, "session-1");

    expect(store.get(collapsedPlansBySessionAtom)["session-1"]).toBeUndefined();
  });

  it("hides finished, dismissed, and missing plans", () => {
    expect(selectVisiblePlan(updateEvent.plan, false)).toEqual(
      updateEvent.plan,
    );
    expect(selectVisiblePlan(updateEvent.plan, true)).toBeNull();
    expect(selectVisiblePlan(finishedPlan, false)).toBeNull();
    expect(selectVisiblePlan(undefined, false)).toBeNull();
  });
});
