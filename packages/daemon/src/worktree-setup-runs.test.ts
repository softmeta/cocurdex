import type { AgentEvent } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { WorktreeSetupRuns, waitForWorktreeSetup } from "./worktree-setup-runs";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function waitInput(
  runs: WorktreeSetupRuns,
  cancelled = new Promise<void>(() => {}),
) {
  const events: AgentEvent[] = [];
  return {
    events,
    input: {
      runs,
      sessionId: "session-1",
      worktreePath: "/wt",
      cancelled,
      emit: (event: AgentEvent) => events.push(event),
    },
  };
}

function toolStatuses(events: AgentEvent[]) {
  return events.map((event) =>
    event.type === "tool.started" || event.type === "tool.finished"
      ? `${event.type}:${event.toolCall.status}`
      : event.type,
  );
}

describe("waitForWorktreeSetup", () => {
  it("returns immediately when no setup is pending", async () => {
    const { events, input } = waitInput(new WorktreeSetupRuns());
    await waitForWorktreeSetup(input);
    expect(events).toEqual([]);
  });

  it("holds the turn until setup finishes and reports its output", async () => {
    const runs = new WorktreeSetupRuns();
    const setup = deferred<string>();
    runs.start("/wt", "pnpm install", () => setup.promise);
    const { events, input } = waitInput(runs);

    const waiting = waitForWorktreeSetup(input);
    setup.resolve("installed\n");
    await waiting;

    expect(toolStatuses(events)).toEqual([
      "tool.started:in_progress",
      "tool.finished:completed",
    ]);
    const finished = events[1];
    expect(
      finished?.type === "tool.finished" && finished.toolCall.content,
    ).toEqual([{ type: "text", text: "installed" }]);
    await waitForWorktreeSetup(waitInput(runs).input);
    expect(runs.get("/wt")).toBeUndefined();
  });

  it("fails the first turn after a setup failure, then lets later turns proceed", async () => {
    const runs = new WorktreeSetupRuns();
    runs.start("/wt", "exit 1", () => Promise.reject(new Error("boom")));
    const { events, input } = waitInput(runs);

    await expect(waitForWorktreeSetup(input)).rejects.toThrow(/boom/);
    expect(toolStatuses(events)).toEqual([
      "tool.started:in_progress",
      "tool.finished:failed",
    ]);
    await expect(
      waitForWorktreeSetup(waitInput(runs).input),
    ).resolves.toBeUndefined();
  });

  it("stops waiting on cancel but keeps the setup for the next turn", async () => {
    const runs = new WorktreeSetupRuns();
    const setup = deferred<string>();
    runs.start("/wt", "sleep 60", () => setup.promise);
    const cancel = deferred<void>();
    const { events, input } = waitInput(runs, cancel.promise);

    const waiting = waitForWorktreeSetup(input);
    cancel.resolve();
    await waiting;

    expect(toolStatuses(events)).toEqual([
      "tool.started:in_progress",
      "tool.finished:failed",
    ]);
    expect(runs.get("/wt")).toBeDefined();
  });
});
