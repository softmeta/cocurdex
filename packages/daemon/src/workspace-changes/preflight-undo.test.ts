import type { TurnFileChange } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { preflightTurnUndo, undoHasConflicts } from "./preflight-undo";

function file(
  path: string,
  operation: TurnFileChange["operation"],
  afterHash: string | null,
): TurnFileChange {
  return {
    path,
    operation,
    reviewKind: "text",
    afterHash,
  };
}

describe("preflightTurnUndo", () => {
  it("blocks restore when the current hash does not match the recorded after hash", () => {
    const results = preflightTurnUndo(
      [file("src/a.ts", "modify", "after")],
      new Map([["src/a.ts", "other"]]),
    );
    expect(results).toEqual([
      {
        path: "src/a.ts",
        status: "conflict",
        reason: "File changed after this turn",
      },
    ]);
    expect(undoHasConflicts(results)).toBe(true);
  });

  it("allows restore when every path still matches the turn result", () => {
    const results = preflightTurnUndo(
      [
        file("src/a.ts", "modify", "after"),
        file("src/new.ts", "add", "added"),
        file("src/gone.ts", "delete", null),
      ],
      new Map([
        ["src/a.ts", "after"],
        ["src/new.ts", "added"],
      ]),
    );
    expect(results.every((result) => result.status === "restored")).toBe(true);
    expect(undoHasConflicts(results)).toBe(false);
  });

  it("fails closed when checkpoint bytes were never stored", () => {
    const results = preflightTurnUndo(
      [
        {
          path: "shot.bin",
          operation: "modify",
          reviewKind: "binary",
          afterHash: "after",
          restorable: false,
        },
      ],
      new Map([["shot.bin", "after"]]),
    );
    expect(results[0]?.status).toBe("failed");
  });

  it("conflicts when a deleted file was recreated after the turn", () => {
    const results = preflightTurnUndo(
      [file("src/gone.ts", "delete", null)],
      new Map([["src/gone.ts", "recreated"]]),
    );
    expect(results[0]?.status).toBe("conflict");
  });
});
