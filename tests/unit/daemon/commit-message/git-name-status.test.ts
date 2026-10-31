import { parseNameStatusZero } from "@cocurdex/daemon/internal/commit-message/git-name-status";
import { describe, expect, it } from "vitest";

describe("parseNameStatusZero", () => {
  it("parses added, modified, and deleted entries", () => {
    const raw = ["A", "src/a.ts", "M", "src/b.ts", "D", "src/c.ts", ""].join(
      "\0",
    );
    expect(parseNameStatusZero(raw)).toEqual([
      { status: "A", path: "src/a.ts" },
      { status: "M", path: "src/b.ts" },
      { status: "D", path: "src/c.ts" },
    ]);
  });

  it("parses renames with from/to paths", () => {
    const raw = ["R100", "old/name.ts", "new/name.ts", ""].join("\0");
    expect(parseNameStatusZero(raw)).toEqual([
      { status: "R", path: "new/name.ts", fromPath: "old/name.ts" },
    ]);
  });
});
