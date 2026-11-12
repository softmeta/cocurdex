import { describe, expect, it } from "vitest";
import {
  initialSettledLabel,
  LABEL_ENTER_MS,
  LABEL_HOLD_MS,
  settleLabel,
} from "@/features/agent/view/settled-label";

function advance<T>(
  steps: Array<[at: number, key: string, value: T]>,
  start: { key: string; value: T },
) {
  let state = initialSettledLabel(start.key, start.value, 0);
  const shown: Array<[number, T]> = [];
  for (const [at, key, value] of steps) {
    state = settleLabel(state, key, value, at).state;
    shown.push([at, state.value]);
  }
  return shown;
}

describe("settleLabel", () => {
  it("never shows a label that went away before the enter delay", () => {
    const shown = advance(
      [
        [1_000, "tool:read", "Read package.json"],
        [1_050, "working", "Working"],
        [1_000 + LABEL_ENTER_MS, "working", "Working"],
      ],
      { key: "working", value: "Working" },
    );

    expect(shown.map(([, value]) => value)).toEqual([
      "Working",
      "Working",
      "Working",
    ]);
  });

  it("switches to a label that stays past the enter delay", () => {
    const shown = advance(
      [
        [1_000, "tool:test", "Run pnpm test"],
        [1_000 + LABEL_ENTER_MS - 1, "tool:test", "Run pnpm test"],
        [1_000 + LABEL_ENTER_MS, "tool:test", "Run pnpm test"],
      ],
      { key: "working", value: "Working" },
    );

    expect(shown.map(([, value]) => value)).toEqual([
      "Working",
      "Working",
      "Run pnpm test",
    ]);
  });

  it("keeps a shown label for the hold time after its activity ends", () => {
    let state = initialSettledLabel("working", "Working", 0);
    state = settleLabel(state, "tool:a", "Read a", 1_000).state;
    const enteredAt = 1_000 + LABEL_ENTER_MS;
    state = settleLabel(state, "tool:a", "Read a", enteredAt).state;
    expect(state.value).toBe("Read a");

    const ended = settleLabel(state, "working", "Working", enteredAt + 10);
    expect(ended.state.value).toBe("Read a");
    expect(ended.wakeAt).toBe(enteredAt + LABEL_HOLD_MS);

    const released = settleLabel(
      ended.state,
      "working",
      "Working",
      enteredAt + LABEL_HOLD_MS,
    );
    expect(released.state.value).toBe("Working");
    expect(released.wakeAt).toBeNull();
  });

  it("returns the same state while the shown label is still wanted", () => {
    const state = initialSettledLabel("working", "Working", 0);
    const next = settleLabel(state, "working", "Working", 5_000);

    expect(next.state).toBe(state);
    expect(next.wakeAt).toBeNull();
  });
});
