import { describe, expect, it } from "vitest";
import { collectDescendantPids } from "./process-tree";

describe("collectDescendantPids", () => {
  it("walks every generation below the root and nothing beside it", () => {
    const table = [
      "    1     0",
      "  100     1",
      "  200   100",
      "  201   100",
      "  300   200",
      "  999     1",
      "",
    ].join("\n");

    expect(collectDescendantPids(table, 100).sort()).toEqual([200, 201, 300]);
  });

  it("returns nothing for a process without children", () => {
    expect(collectDescendantPids("  100     1\n", 100)).toEqual([]);
  });

  it("ignores malformed rows and parent cycles", () => {
    const table = ["garbage", "  100   1", "  200   100", "  100   200"].join(
      "\n",
    );

    expect(collectDescendantPids(table, 100)).toEqual([200]);
  });
});
