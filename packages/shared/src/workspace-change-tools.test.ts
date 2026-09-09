import { describe, expect, it } from "vitest";
import { toolMayMutateWorkspace } from "./workspace-change-tools";

describe("toolMayMutateWorkspace", () => {
  it("treats read, search, and list tools as non-mutating", () => {
    expect(toolMayMutateWorkspace({ kind: "read" })).toBe(false);
    expect(toolMayMutateWorkspace({ kind: "grep" })).toBe(false);
    expect(toolMayMutateWorkspace({ kind: "glob" })).toBe(false);
    expect(toolMayMutateWorkspace({ kind: "list" })).toBe(false);
    expect(toolMayMutateWorkspace({ title: "Read src/app.ts" })).toBe(false);
    expect(toolMayMutateWorkspace({ kind: "WebFetch" })).toBe(false);
  });

  it("treats write, edit, and shell tools as mutating", () => {
    expect(toolMayMutateWorkspace({ kind: "write" })).toBe(true);
    expect(toolMayMutateWorkspace({ kind: "edit" })).toBe(true);
    expect(toolMayMutateWorkspace({ kind: "bash" })).toBe(true);
    expect(toolMayMutateWorkspace({ kind: "exec" })).toBe(true);
    expect(toolMayMutateWorkspace({ kind: "execute" })).toBe(true);
  });

  it("treats unknown tools as mutating so bash-like writes are still captured", () => {
    expect(toolMayMutateWorkspace({ kind: "mcp__db__query" })).toBe(true);
    expect(toolMayMutateWorkspace({})).toBe(true);
  });
});
