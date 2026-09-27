import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logDaemonDiagnostic } from "./diagnostics";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logDaemonDiagnostic", () => {
  it("emits a prefixed structured payload when diagnostics are enabled", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logDaemonDiagnostic("info", "daemon.ready", { attempts: 1 });

    expect(info).toHaveBeenCalledWith(
      `${COCURDEX_DAEMON_DIAGNOSTIC_PREFIX}${JSON.stringify({
        details: { attempts: 1 },
        event: "daemon.ready",
        level: "info",
      })}`,
    );
  });

  it("emits info and warn diagnostics without the opt-in flag", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "0");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logDaemonDiagnostic("info", "daemon.ready");
    logDaemonDiagnostic("warn", "daemon.degraded");

    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("keeps debug-level diagnostics gated behind the opt-in flag", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "0");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    logDaemonDiagnostic("debug", "daemon.trace");

    expect(debug).not.toHaveBeenCalled();
  });
});
