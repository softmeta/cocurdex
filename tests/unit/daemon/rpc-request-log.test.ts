import { classifyDaemonRequest } from "@cocurdex/daemon/internal/rpc-request-log";
import { describe, expect, it } from "vitest";

describe("classifyDaemonRequest", () => {
  it("warns for failures regardless of duration", () => {
    expect(
      classifyDaemonRequest({
        method: "session.list",
        durationMs: 3,
        failed: true,
      }),
    ).toEqual({ level: "warn", event: "rpc.failed" });
  });

  it("flags a slow request on a method expected to answer quickly", () => {
    expect(
      classifyDaemonRequest({
        method: "session.list",
        durationMs: 1_500,
        failed: false,
      }),
    ).toEqual({ level: "warn", event: "rpc.slow" });
  });

  it("keeps long-running and subscription methods at debug", () => {
    for (const method of ["session.send", "git.push", "daemon.subscribe"]) {
      expect(
        classifyDaemonRequest({ method, durationMs: 60_000, failed: false }),
      ).toEqual({ level: "debug", event: "rpc.completed" });
    }
    expect(
      classifyDaemonRequest({
        method: "session.list",
        durationMs: 5,
        failed: false,
      }),
    ).toEqual({ level: "debug", event: "rpc.completed" });
  });
});
