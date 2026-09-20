import type { AgentEvent } from "@cocurdex/shared";
import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
// Imported from the source file, not the feature barrel: the barrel pulls in
// the app shell and its browser-only preference bootstrap.
import {
  applyPlanEventAtom,
  autoCollapsedPlansBySessionAtom,
  collapsedPlansBySessionAtom,
  dismissedPlansBySessionAtom,
  dismissPlanForSessionAtom,
  loadSessionPlanAtom,
  plansBySessionAtom,
  resolvePlanStepStatus,
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

  it("auto-collapses an unfinished plan when the turn ends", () => {
    const store = createStore();
    const idle: AgentEvent = {
      type: "state.changed",
      sessionId: "session-1",
      status: "idle",
    };

    store.set(applyPlanEventAtom, updateEvent);
    store.set(applyPlanEventAtom, idle);

    expect(store.get(autoCollapsedPlansBySessionAtom)["session-1"]).toBe(true);
  });

  it("does not auto-collapse finished plans or a running turn", () => {
    const store = createStore();

    store.set(applyPlanEventAtom, {
      ...updateEvent,
      plan: finishedPlan,
    });
    store.set(applyPlanEventAtom, {
      type: "state.changed",
      sessionId: "session-1",
      status: "idle",
    });
    store.set(applyPlanEventAtom, {
      ...updateEvent,
      sessionId: "session-2",
    });
    store.set(applyPlanEventAtom, {
      type: "state.changed",
      sessionId: "session-2",
      status: "running",
    });

    const autoCollapsed = store.get(autoCollapsedPlansBySessionAtom);
    expect(autoCollapsed["session-1"]).toBeUndefined();
    expect(autoCollapsed["session-2"]).toBeUndefined();
  });

  it("re-expands an auto-collapsed plan on the next update", () => {
    const store = createStore();

    store.set(applyPlanEventAtom, updateEvent);
    store.set(applyPlanEventAtom, {
      type: "state.changed",
      sessionId: "session-1",
      status: "idle",
    });
    store.set(applyPlanEventAtom, updateEvent);

    expect(
      store.get(autoCollapsedPlansBySessionAtom)["session-1"],
    ).toBeUndefined();
  });

  it("lets the user expand an auto-collapsed plan without latching", () => {
    const store = createStore();

    store.set(applyPlanEventAtom, updateEvent);
    store.set(applyPlanEventAtom, {
      type: "state.changed",
      sessionId: "session-1",
      status: "idle",
    });
    store.set(togglePlanCollapsedForSessionAtom, "session-1");

    expect(
      store.get(autoCollapsedPlansBySessionAtom)["session-1"],
    ).toBeUndefined();
    expect(store.get(collapsedPlansBySessionAtom)["session-1"]).toBeUndefined();
  });

  it("hydrates and clears plans from a resync snapshot", () => {
    const store = createStore();

    store.set(loadSessionPlanAtom, {
      sessionId: "session-1",
      plan: updateEvent.plan,
    });
    expect(store.get(plansBySessionAtom)["session-1"]).toEqual(
      updateEvent.plan,
    );

    store.set(loadSessionPlanAtom, { sessionId: "session-1", plan: null });
    expect(store.get(plansBySessionAtom)["session-1"]).toBeUndefined();
  });

  it("hides finished, dismissed, and missing plans", () => {
    expect(selectVisiblePlan(updateEvent.plan, false)).toEqual(
      updateEvent.plan,
    );
    expect(selectVisiblePlan(updateEvent.plan, true)).toBeNull();
    expect(selectVisiblePlan(finishedPlan, false)).toBeNull();
    expect(selectVisiblePlan(undefined, false)).toBeNull();
  });

  it("only reports a step as in progress while the agent is running", () => {
    expect(resolvePlanStepStatus("in_progress", true)).toBe("in_progress");
    expect(resolvePlanStepStatus("in_progress", false)).toBe("pending");
    expect(resolvePlanStepStatus("pending", false)).toBe("pending");
    expect(resolvePlanStepStatus("completed", false)).toBe("completed");
  });
});
