import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityState } from "./chat-activity-state";
import { useActivityMotion } from "./use-activity-motion";

function activity(
  kind: ActivityState["kind"],
  toolActivityId?: string,
): ActivityState {
  return { kind, tone: "running", toolActivityId };
}

describe("useActivityMotion", () => {
  it("uses distinct thinking and replying motion", () => {
    const { result, rerender } = renderHook(useActivityMotion, {
      initialProps: activity("thinking"),
    });
    expect(result.current.motion).toBe("thinking");
    rerender(activity("responding"));
    expect(result.current.motion).toBe("replying");
  });

  it("plays a full cycle for a tool that completed between renders", () => {
    const { result, rerender } = renderHook(useActivityMotion, {
      initialProps: activity("thinking"),
    });
    rerender(activity("thinking", "fast-read"));
    expect(result.current.motion).toBe("working");
    rerender(activity("responding", "fast-read"));
    expect(result.current.motion).toBe("working");
    act(() => result.current.completeWorkingCycle());
    expect(result.current.motion).toBe("replying");
  });

  it("does not replay existing tool history on mount", () => {
    const { result } = renderHook(useActivityMotion, {
      initialProps: activity("responding", "old-read"),
    });
    expect(result.current.motion).toBe("replying");
  });

  it("keeps working across active tool changes and animation cycles", () => {
    const { result, rerender } = renderHook(useActivityMotion, {
      initialProps: activity("usingTools", "first"),
    });
    act(() => result.current.completeWorkingCycle());
    expect(result.current.motion).toBe("working");
    rerender(activity("usingTools", "second"));
    expect(result.current.motion).toBe("working");
    rerender(activity("thinking", "second"));
    act(() => result.current.completeWorkingCycle());
    expect(result.current.motion).toBe("thinking");
    rerender(activity("thinking", "second"));
    expect(result.current.motion).toBe("thinking");
    rerender(activity("thinking", "third"));
    expect(result.current.motion).toBe("working");
  });
});
