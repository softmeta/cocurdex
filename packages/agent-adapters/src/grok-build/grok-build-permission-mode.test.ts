import { describe, expect, it } from "vitest";
import { buildGrokPermissionParams } from "./grok-build-permission-mode";

describe("buildGrokPermissionParams", () => {
  it("clears both flags for ask", () => {
    expect(buildGrokPermissionParams("grok-ask")).toEqual({
      permission_mode: "ask",
      yolo_mode: false,
      auto_mode: false,
    });
  });

  it("omits yolo_mode for auto so yolo cannot win", () => {
    const params = buildGrokPermissionParams("grok-auto");

    expect(params).toEqual({ permission_mode: "auto", auto_mode: true });
    expect(params).not.toHaveProperty("yolo_mode");
  });

  it("sets yolo_mode for always-approve", () => {
    expect(buildGrokPermissionParams("grok-always-approve")).toEqual({
      permission_mode: "always-approve",
      yolo_mode: true,
    });
  });

  it("ignores other agents' permission modes", () => {
    expect(buildGrokPermissionParams("claude-default")).toBeNull();
    expect(buildGrokPermissionParams("codex-full-access")).toBeNull();
  });
});
