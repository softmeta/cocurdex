import { describe, expect, it, vi } from "vitest";
import {
  type ProcessGoneReason,
  startCrashReporter,
  summarizeProcessGone,
} from "./crash-reporter";

describe("summarizeProcessGone", () => {
  it("flags crash-like reasons as fatal", () => {
    const fatalReasons: ProcessGoneReason[] = [
      "abnormal-exit",
      "crashed",
      "oom",
      "launch-failed",
      "integrity-failure",
    ];

    for (const reason of fatalReasons) {
      expect(summarizeProcessGone({ exitCode: 133, reason }).fatal).toBe(true);
    }
  });

  it("treats routine lifecycle exits as non-fatal", () => {
    const routineReasons: ProcessGoneReason[] = [
      "clean-exit",
      "killed",
      "memory-eviction",
    ];

    for (const reason of routineReasons) {
      expect(summarizeProcessGone({ exitCode: 0, reason }).fatal).toBe(false);
    }
  });

  it("preserves reason and exitCode in the summary", () => {
    expect(summarizeProcessGone({ exitCode: 139, reason: "crashed" })).toEqual({
      exitCode: 139,
      fatal: true,
      reason: "crashed",
    });
  });
});

describe("startCrashReporter", () => {
  it("collects local minidumps without uploading", () => {
    const start = vi.fn();

    startCrashReporter({ start });

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0]?.[0]).toMatchObject({ uploadToServer: false });
  });
});
