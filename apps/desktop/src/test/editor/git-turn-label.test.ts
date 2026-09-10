import type { TurnChangeSet } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import { turnListTitle } from "@/features/editor/git-turn-label";

function turn(files: string[]): TurnChangeSet {
  return {
    id: "c",
    sessionId: "s",
    messageId: "m",
    userMessageId: "u",
    source: "git-checkpoint",
    coverage: "workspace",
    files: files.map((path) => ({
      path,
      operation: "modify",
      reviewKind: "text",
    })),
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("turnListTitle", () => {
  it("uses the user prompt when present", () => {
    expect(turnListTitle(turn(["a.ts"]), "  Add Pi to the title  ")).toBe(
      "Add Pi to the title",
    );
  });

  it("falls back to the first file name when the prompt is empty", () => {
    expect(turnListTitle(turn(["apps/desktop/src/a.ts"]), "  \n")).toBe("a.ts");
  });
});
