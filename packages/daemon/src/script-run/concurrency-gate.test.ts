import { describe, expect, it } from "vitest";
import { createConcurrencyGate } from "./concurrency-gate";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createConcurrencyGate", () => {
  it("never runs more tasks at once than its limit", async () => {
    const gate = createConcurrencyGate(2);
    let active = 0;
    let peak = 0;
    const releases = Array.from({ length: 5 }, deferred);
    const runs = releases.map((release, index) =>
      gate.run(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await release.promise;
        active -= 1;
        return index;
      }),
    );
    for (const release of releases) {
      await Promise.resolve();
      release.resolve();
    }
    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("releases its slot when a task throws", async () => {
    const gate = createConcurrencyGate(1);
    await expect(
      gate.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await gate.run(async () => "next")).toBe("next");
  });
});
