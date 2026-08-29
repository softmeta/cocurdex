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

  it("does not emit when diagnostics are disabled", () => {
    vi.stubEnv("COCURDEX_DIAGNOSTICS", "0");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logDaemonDiagnostic("info", "daemon.ready");

    expect(info).not.toHaveBeenCalled();
  });
});
