import { logAdapterDiagnostic } from "@cocurdex/agent-adapters/internal/diagnostics";
import {
  executableNameForLog,
  processExitLogLevel,
} from "@cocurdex/agent-adapters/internal/shared/process-tree";
import { installLogSink, type LogRecord } from "@cocurdex/shared/node";
import { describe, expect, it } from "vitest";

describe("logAdapterDiagnostic", () => {
  it("writes adapter records under their own scope with sanitized details", () => {
    const records: LogRecord[] = [];
    const restore = installLogSink({
      accepts: () => true,
      write: (record) => records.push(record),
    });
    try {
      logAdapterDiagnostic("info", "[AcpAgentAdapter] session opened", {
        sessionId: "session-1",
        prompt: "do not log me",
      });
    } finally {
      restore();
    }

    expect(records).toEqual([
      expect.objectContaining({
        details: { prompt: "[redacted]", sessionId: "session-1" },
        event: "[AcpAgentAdapter] session opened",
        scope: "agent-adapters",
      }),
    ]);
  });
});

describe("process lifecycle logging", () => {
  it("names executables without their directory or Windows shim extension", () => {
    expect(executableNameForLog("/home/dev/.local/bin/claude")).toBe("claude");
    expect(
      executableNameForLog("C:\\Users\\dev\\AppData\\npm\\codex.cmd"),
    ).toBe("codex");
    expect(executableNameForLog("npx")).toBe("npx");
  });

  it("warns only for a non-zero exit that no signal caused", () => {
    expect(processExitLogLevel(0, null)).toBe("info");
    expect(processExitLogLevel(null, "SIGTERM")).toBe("info");
    expect(processExitLogLevel(1, null)).toBe("warn");
  });
});
