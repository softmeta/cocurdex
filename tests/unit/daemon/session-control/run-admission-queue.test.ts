import { RunAdmissionQueue } from "@cocurdex/daemon/internal/session-control/run-admission-queue";
import { describe, expect, it } from "vitest";

describe("RunAdmissionQueue", () => {
  it("keeps sessions in arrival order without duplicates", () => {
    const queue = new RunAdmissionQueue();
    queue.enqueue("a");
    queue.enqueue("b");
    queue.enqueue("a");

    expect(queue.waiting()).toEqual(["a", "b"]);
  });

  it("releases everyone waiting on a session once it is admitted", async () => {
    const queue = new RunAdmissionQueue();
    queue.enqueue("a");
    const first = queue.whenAdmitted("a");
    const second = queue.whenAdmitted("a");

    queue.admitted("a");

    await expect(Promise.all([first, second])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(queue.isWaiting("a")).toBe(false);
  });

  it("does not block a session that is not waiting", async () => {
    await expect(new RunAdmissionQueue().whenAdmitted("a")).resolves.toBe(
      undefined,
    );
  });

  it("rejects waiters when a waiting session is cancelled", async () => {
    const queue = new RunAdmissionQueue();
    queue.enqueue("a");
    queue.enqueue("b");
    const waiting = queue.whenAdmitted("a");

    queue.cancel("a", new Error("stopped"));

    await expect(waiting).rejects.toThrow("stopped");
    expect(queue.waiting()).toEqual(["b"]);
  });
});
