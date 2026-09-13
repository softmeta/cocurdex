import { describe, expect, it } from "vitest";
import { SessionCommandQueue } from "./commands";

describe("session command serialization", () => {
  it("serializes one session while allowing another session to proceed", async () => {
    const queue = new SessionCommandQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const first = queue.run("a", async () => {
      await gate;
      order.push("first");
    });
    const second = queue.run("a", async () => {
      order.push("second");
    });
    await queue.run("b", async () => {
      order.push("independent");
    });
    expect(order).toEqual(["independent"]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["independent", "first", "second"]);
  });

  it("does not poison later commands after a rejection", async () => {
    const queue = new SessionCommandQueue();
    const failure = queue.run("a", async () => {
      throw new Error("failed");
    });
    const next = queue.run("a", async () => "accepted");
    await expect(failure).rejects.toThrow("failed");
    await expect(next).resolves.toBe("accepted");
  });
});
