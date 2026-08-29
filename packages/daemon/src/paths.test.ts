import { describe, expect, it } from "vitest";
import { getDaemonSocketPath } from "./paths";

describe("getDaemonSocketPath", () => {
  it("uses a filesystem socket on macOS and Linux", () => {
    expect(getDaemonSocketPath("/tmp/cocurdex", "darwin")).toBe(
      "/tmp/cocurdex/daemon.sock",
    );
    expect(getDaemonSocketPath("/tmp/cocurdex", "linux")).toBe(
      "/tmp/cocurdex/daemon.sock",
    );
  });

  it("uses a profile-specific named pipe on Windows", () => {
    const first = getDaemonSocketPath("C:\\Users\\a\\Cocurdex", "win32");
    const second = getDaemonSocketPath("C:\\Users\\b\\Cocurdex", "win32");

    expect(first).toMatch(/^\\\\\.\\pipe\\cocurdex-daemon-[a-f0-9]{16}$/);
    expect(second).not.toBe(first);
  });
});
