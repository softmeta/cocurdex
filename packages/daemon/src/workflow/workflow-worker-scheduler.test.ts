import { describe, expect, it } from "vitest";
import { WorkflowWorkerScheduler } from "./workflow-worker-scheduler";

describe("WorkflowWorkerScheduler", () => {
  it("drains available actions until the worker reports idle", async () => {
    const results = [
      { status: "completed" as const },
      { status: "suspended" as const },
      { status: "idle" as const },
    ];
    let calls = 0;
    const scheduler = new WorkflowWorkerScheduler({
      async runNext() {
        calls += 1;
        return results.shift() ?? { status: "idle" as const };
      },
    });

    await scheduler.wake();

    expect(calls).toBe(3);
    await scheduler.close();
  });

  it("coalesces concurrent wake requests into one drain", async () => {
    let release: (() => void) | undefined;
    let calls = 0;
    const scheduler = new WorkflowWorkerScheduler({
      async runNext() {
        calls += 1;
        if (calls === 1) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { status: "completed" as const };
        }
        return { status: "idle" as const };
      },
    });

    const first = scheduler.wake();
    const second = scheduler.wake();
    release?.();
    await Promise.all([first, second]);

    expect(calls).toBe(2);
    await scheduler.close();
  });

  it("processes independent workflow actions up to the configured concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    let completed = 0;
    const scheduler = new WorkflowWorkerScheduler(
      {
        async runNext() {
          if (completed >= 2) return { status: "idle" as const };
          active += 1;
          maxActive = Math.max(maxActive, active);
          await new Promise<void>((resolve) => releases.push(resolve));
          active -= 1;
          completed += 1;
          return { status: "completed" as const };
        },
      },
      { concurrency: 2 },
    );

    const draining = scheduler.wake();
    await Promise.resolve();
    expect(maxActive).toBe(2);
    for (const release of releases) release();
    await draining;

    expect(completed).toBe(2);
    await scheduler.close();
  });
});
