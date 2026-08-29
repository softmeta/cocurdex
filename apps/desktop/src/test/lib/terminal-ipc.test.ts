import { describe, expect, it } from "vitest";
import { desktopApi } from "@/lib";
import { schemas } from "../../../electron/ipc";

// Sanity tests for the PTY IPC boundary. These don't spin up node-pty; they
// just exercise the schema parsers and the renderer-side surface so a
// refactor that drops a method, narrows a type, or relaxes validation gets
// caught before it reaches a live shell.

describe("schemas.ptySpawn", () => {
  it("accepts a well-formed spawn payload", () => {
    const parsed = schemas.ptySpawn.safeParse({
      terminalId: "terminal-1",
      workspaceId: "ws-1",
      cwd: "/Users/example/project",
      cols: 80,
      rows: 24,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects relative cwd", () => {
    const parsed = schemas.ptySpawn.safeParse({
      terminalId: "terminal-1",
      workspaceId: "ws-1",
      cwd: "relative/path",
      cols: 80,
      rows: 24,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-positive cols/rows", () => {
    const parsed = schemas.ptySpawn.safeParse({
      terminalId: "terminal-1",
      workspaceId: "ws-1",
      cwd: "/tmp",
      cols: 0,
      rows: -1,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects cols/rows above the dimension cap", () => {
    const parsed = schemas.ptySpawn.safeParse({
      terminalId: "terminal-1",
      workspaceId: "ws-1",
      cwd: "/tmp",
      cols: 5000,
      rows: 5000,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects workspaceId with path separators", () => {
    const parsed = schemas.ptySpawn.safeParse({
      terminalId: "terminal-1",
      workspaceId: "../escape",
      cwd: "/tmp",
      cols: 80,
      rows: 24,
    });
    expect(parsed.success).toBe(false);
  });
});

describe("schemas.ptyWrite", () => {
  it("accepts UTF-8 keystrokes", () => {
    expect(
      schemas.ptyWrite.safeParse({
        terminalId: "terminal-1",
        data: "echo 你好\n",
      }).success,
    ).toBe(true);
  });

  it("rejects payloads above the 1MB cap", () => {
    const parsed = schemas.ptyWrite.safeParse({
      terminalId: "terminal-1",
      data: "x".repeat(1_000_001),
    });
    expect(parsed.success).toBe(false);
  });
});

describe("schemas.ptyResize", () => {
  it("accepts integer dimensions", () => {
    expect(
      schemas.ptyResize.safeParse({
        terminalId: "terminal-1",
        cols: 100,
        rows: 30,
      }).success,
    ).toBe(true);
  });

  it("rejects non-integer dimensions", () => {
    expect(
      schemas.ptyResize.safeParse({
        terminalId: "terminal-1",
        cols: 80.5,
        rows: 24,
      }).success,
    ).toBe(false);
  });
});

describe("schemas.ptyKill", () => {
  it("accepts a bare terminalId", () => {
    expect(
      schemas.ptyKill.safeParse({ terminalId: "terminal-1" }).success,
    ).toBe(true);
  });

  it("rejects missing terminalId", () => {
    expect(schemas.ptyKill.safeParse({}).success).toBe(false);
  });
});

describe("desktopApi terminal surface", () => {
  it("exposes pty + openExternal methods", () => {
    expect(typeof desktopApi.ptySpawn).toBe("function");
    expect(typeof desktopApi.ptyWrite).toBe("function");
    expect(typeof desktopApi.ptyResize).toBe("function");
    expect(typeof desktopApi.ptyKill).toBe("function");
    expect(typeof desktopApi.onPtyData).toBe("function");
    expect(typeof desktopApi.onPtyExit).toBe("function");
    expect(typeof desktopApi.openExternal).toBe("function");
  });
});
