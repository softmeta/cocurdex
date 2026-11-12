import { resolveDaemonRuntime } from "@cocurdex/daemon/internal/background/launch-command";
import { describe, expect, it } from "vitest";

const base = {
  env: {},
  execPath: "/opt/cocurdex/runtime/node",
  execArgv: ["--disable-warning=ExperimentalWarning"],
  scriptPath: "/opt/cocurdex/lib/daemon.cjs",
  electronVersion: undefined,
};

describe("daemon runtime", () => {
  it("relaunches a standalone daemon with the same Node runtime and flags", () => {
    expect(resolveDaemonRuntime(base)).toEqual({
      kind: "headless",
      launchCommand: [
        "/opt/cocurdex/runtime/node",
        "--disable-warning=ExperimentalWarning",
        "/opt/cocurdex/lib/daemon.cjs",
      ],
    });
  });

  it("uses the app launcher the desktop app hands its daemon", () => {
    const env = {
      COCURDEX_APP_LAUNCH_COMMAND: JSON.stringify(["/A/Cocurdex"]),
    };
    expect(resolveDaemonRuntime({ ...base, env })).toEqual({
      kind: "app",
      launchCommand: ["/A/Cocurdex"],
    });
    expect(
      resolveDaemonRuntime({
        ...base,
        electronVersion: "45.2.2",
        execPath: "/A/Cocurdex",
      }),
    ).toEqual({ kind: "app", launchCommand: ["/A/Cocurdex"] });
  });

  it("has no relaunch command for a daemon run from source", () => {
    expect(
      resolveDaemonRuntime({
        ...base,
        scriptPath: "/repo/packages/daemon/src/bin.ts",
      }),
    ).toEqual({ kind: "source" });
  });
});
