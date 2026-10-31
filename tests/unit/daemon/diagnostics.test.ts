import { logDaemonDiagnostic } from "@cocurdex/daemon/internal/diagnostics";
import { installLogSink, type LogRecord } from "@cocurdex/shared/node";
import { describe, expect, it } from "vitest";

function captureRecords(minimum: "debug" | "info") {
  const records: LogRecord[] = [];
  const restore = installLogSink({
    accepts: (level) => minimum === "debug" || level !== "debug",
    write: (record) => records.push(record),
  });
  return { records, restore };
}

describe("logDaemonDiagnostic", () => {
  it("writes structured daemon records through the installed sink", () => {
    const { records, restore } = captureRecords("info");
    try {
      logDaemonDiagnostic("error", "daemon.ready", { attempts: 1 });
    } finally {
      restore();
    }

    expect(records).toEqual([
      expect.objectContaining({
        details: { attempts: 1 },
        event: "daemon.ready",
        level: "error",
        pid: process.pid,
        scope: "daemon",
      }),
    ]);
  });

  it("drops debug records unless the sink accepts them", () => {
    const quiet = captureRecords("info");
    try {
      logDaemonDiagnostic("debug", "daemon.trace");
    } finally {
      quiet.restore();
    }
    const verbose = captureRecords("debug");
    try {
      logDaemonDiagnostic("debug", "daemon.trace");
    } finally {
      verbose.restore();
    }

    expect(quiet.records).toHaveLength(0);
    expect(verbose.records).toHaveLength(1);
  });
});
