import {
  routinePermissionMode,
  routinePushAllowed,
} from "@cocurdex/daemon/internal/routines/routine-policy";
import { describe, expect, it } from "vitest";

describe("routinePermissionMode", () => {
  it("keeps unattended read-and-draft runs on each agent's restricted mode", () => {
    expect(
      routinePermissionMode("read-and-draft", "codex", "codex-full-access"),
    ).toBe("codex-read-only");
    expect(
      routinePermissionMode("read-and-draft", "opencode", "opencode-allow"),
    ).toBe("opencode-deny");
  });

  it("uses the role's own mode for ask and its most open mode for full", () => {
    expect(routinePermissionMode("ask", "codex", "codex-auto")).toBe(
      "codex-auto",
    );
    expect(routinePermissionMode("full", "claude-agent", undefined)).toBe(
      "claude-bypass-permissions",
    );
    expect(routinePermissionMode("full", "pi", undefined)).toBeUndefined();
  });
});

describe("routinePushAllowed", () => {
  it("always pushes what needs an answer and filters results by delivery", () => {
    for (const deliver of ["inbox", "push", "silent"] as const) {
      expect(routinePushAllowed(deliver, "approval")).toBe(true);
    }
    expect(routinePushAllowed("push", "turnCompleted")).toBe(true);
    expect(routinePushAllowed("inbox", "turnCompleted")).toBe(false);
    expect(routinePushAllowed("inbox", "turnFailed")).toBe(true);
    expect(routinePushAllowed("silent", "turnFailed")).toBe(false);
  });
});
