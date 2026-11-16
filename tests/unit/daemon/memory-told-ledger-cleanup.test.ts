import { cleanUpToldLedgers } from "@cocurdex/daemon/internal/memory/told-ledger-cleanup";
import { ReasonError } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

const KEY = "memory.toldLedgers";

function harness(stored: Record<string, unknown>) {
  const settings = new Map([[KEY, JSON.stringify(stored)]]);
  const live = new Set(["m1", "m2", "m3"]);
  let failing = new Set<string>();
  const state = {
    getAppSetting: async (key: string) => settings.get(key) ?? null,
    setAppSetting: async (key: string, value: string) => {
      settings.set(key, value);
    },
  };
  const memory = {
    providerId: () => "builtin",
    forget: async (id: string) => {
      if (failing.has(id)) throw new Error("memory is off");
      if (!live.delete(id)) {
        throw new ReasonError("memory.notFound", `Memory not found: ${id}`);
      }
    },
  };
  return {
    run: () => cleanUpToldLedgers(state, memory),
    live,
    stored: () => JSON.parse(settings.get(KEY) ?? "null"),
    fail: (ids: string[]) => {
      failing = new Set(ids);
    },
  };
}

describe("told ledger cleanup", () => {
  it("deletes the records older releases kept, retrying only the ones whose delete failed", async () => {
    const h = harness({
      p1: { provider: "builtin", memoryId: "m1", cursors: { home: "a1" } },
      p2: { provider: "builtin", memoryId: "m2", cursors: {} },
      p3: { provider: "builtin", memoryId: "gone", cursors: {} },
      p4: { provider: "rsrs", memoryId: "m3", cursors: {} },
    });

    h.fail(["m2"]);
    await h.run();
    expect([...h.live]).toEqual(["m2", "m3"]);
    expect(h.stored()).toEqual({
      p2: { provider: "builtin", memoryId: "m2" },
    });

    h.fail([]);
    await h.run();
    expect([...h.live]).toEqual(["m3"]);
    expect(h.stored()).toEqual({});
  });
});
