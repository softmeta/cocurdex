import {
  type AgentPermissionRequestRecord,
  describePermissionRequest,
} from "@cocurdex/shared";
import { describe, expect, it } from "vitest";

function permission(
  overrides: Partial<AgentPermissionRequestRecord>,
): AgentPermissionRequestRecord {
  return {
    id: "p1",
    sessionId: "s1",
    providerId: "claude-agent",
    kind: "execute",
    title: "Bash",
    locations: [],
    options: [],
    status: "pending",
    createdAt: "2026-10-25T00:00:00.000Z",
    updatedAt: "2026-10-25T00:00:00.000Z",
    ...overrides,
  };
}

describe("describePermissionRequest", () => {
  it("shows the command a tool titled only by name would run", () => {
    const display = describePermissionRequest(
      permission({
        rawInput: { toolName: "Bash", input: { command: "rm -rf build" } },
      }),
    );

    expect(display.summary).toEqual({ kind: "command" });
    expect(display.details).toContainEqual({
      label: "Command",
      monospace: true,
      value: "rm -rf build",
    });
  });

  it("names the file a write would change", () => {
    const display = describePermissionRequest(
      permission({
        kind: "edit",
        title: "Write",
        rawInput: {
          toolName: "Write",
          input: { file_path: "/work/acme-shop/src/cart.ts" },
        },
      }),
    );

    expect(display.summary).toEqual({
      kind: "file",
      action: "write",
      target: "cart.ts",
    });
    expect(display.details).toContainEqual({
      label: "Path",
      monospace: true,
      value: "/work/acme-shop/src/cart.ts",
    });
  });

  it("falls back to the raw input when another provider's grant has no known fields", () => {
    const display = describePermissionRequest(
      permission({
        providerId: "codex",
        title: "Grant permissions",
        rawInput: { network: { allow: ["registry.npmjs.org"] } },
      }),
    );

    expect(display.summary).toEqual({
      kind: "title",
      text: "Grant permissions",
    });
    expect(display.details).toEqual([]);
    expect(display.rawInput).toContain("registry.npmjs.org");
  });
});
