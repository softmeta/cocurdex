import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logAdapterDiagnostic } from "./diagnostics";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logAdapterDiagnostic", () => {
  it("emits a prefixed structured payload the daemon host can parse", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logAdapterDiagnostic("info", "[AcpAgentAdapter] session opened", {
      sessionId: "session-1",
    });

    expect(info).toHaveBeenCalledWith(
      `${COCURDEX_DAEMON_DIAGNOSTIC_PREFIX}${JSON.stringify({
        details: { sessionId: "session-1" },
        event: "[AcpAgentAdapter] session opened",
        level: "info",
      })}`,
    );
  });

  it("does not emit when diagnostics are disabled", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "0");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logAdapterDiagnostic("info", "adapter.event");

    expect(info).not.toHaveBeenCalled();
  });
});
