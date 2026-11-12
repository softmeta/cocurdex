import { headlessDaemonCommand } from "@cocurdex/cli/internal/headless-daemon";
import { describe, expect, it } from "vitest";

describe("headless daemon command", () => {
  it("starts the daemon bundled beside the CLI with the same Node runtime", () => {
    const files = new Set(["/opt/cocurdex/lib/daemon.cjs"]);
    expect(
      headlessDaemonCommand({
        cliDir: "/opt/cocurdex/lib",
        execPath: "/opt/cocurdex/runtime/node",
        platform: "linux",
        exists: (file) => files.has(file),
      }),
    ).toEqual(["/opt/cocurdex/runtime/node", "/opt/cocurdex/lib/daemon.cjs"]);
  });

  it("starts the windowless runtime on Windows so its login item opens no console", () => {
    const files = new Set([
      "C:\\Cocurdex\\lib\\daemon.cjs",
      "C:\\Cocurdex\\runtime\\cocurdex-daemon.exe",
    ]);
    expect(
      headlessDaemonCommand({
        cliDir: "C:\\Cocurdex\\lib",
        execPath: "C:\\Cocurdex\\runtime\\node.exe",
        platform: "win32",
        exists: (file) => files.has(file),
      }),
    ).toEqual([
      "C:\\Cocurdex\\runtime\\cocurdex-daemon.exe",
      "C:\\Cocurdex\\lib\\daemon.cjs",
    ]);
  });

  it("does nothing outside a standalone install", () => {
    expect(
      headlessDaemonCommand({
        cliDir: "/repo/apps/cli/src",
        execPath: "/usr/bin/node",
        platform: "darwin",
        exists: () => false,
      }),
    ).toBeNull();
  });
});
