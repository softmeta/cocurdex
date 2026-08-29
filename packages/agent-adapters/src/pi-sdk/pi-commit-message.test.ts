import { describe, expect, it } from "vitest";
import { normalizeGeneratedCommitMessage } from "./pi-commit-message";

describe("normalizeGeneratedCommitMessage", () => {
  it("keeps a title and unordered-list body", () => {
    expect(
      normalizeGeneratedCommitMessage(
        "feat(desktop): add commit popover\n\n- Add commit actions\n- Preserve staged changes",
      ),
    ).toBe(
      "feat(desktop): add commit popover\n\n- Add commit actions\n- Preserve staged changes",
    );
  });

  it("normalizes fenced and mixed-list output", () => {
    expect(
      normalizeGeneratedCommitMessage(
        "```text\nfix(git): avoid index lock conflicts\n\n* Isolate message generation\n1. Preserve the real index\n```",
      ),
    ).toBe(
      "fix(git): avoid index lock conflicts\n\n- Isolate message generation\n- Preserve the real index",
    );
  });

  it("accepts a non-conventional title with a body", () => {
    expect(
      normalizeGeneratedCommitMessage(
        "Update Git handling\n\n- Generate a detailed commit message",
      ),
    ).toBe("Update Git handling\n\n- Generate a detailed commit message");
  });

  it("truncates a long title without truncating body items", () => {
    const title = `feat: ${"x".repeat(100)}`;
    const normalized = normalizeGeneratedCommitMessage(
      `${title}\n\n- Explain the complete change in the body`,
    );
    const [normalizedTitle, , body] = normalized?.split("\n") ?? [];
    expect(normalizedTitle?.length).toBeLessThanOrEqual(72);
    expect(normalizedTitle?.endsWith("…")).toBe(true);
    expect(body).toBe("- Explain the complete change in the body");
  });

  it("rejects output without both a title and body", () => {
    expect(normalizeGeneratedCommitMessage("   \n  ")).toBeNull();
    expect(
      normalizeGeneratedCommitMessage("feat: title without a body"),
    ).toBeNull();
  });
});
