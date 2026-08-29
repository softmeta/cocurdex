import { describe, expect, it } from "vitest";
import { hasSameMcpServerStatuses } from "./claude-runtime";

describe("hasSameMcpServerStatuses", () => {
  it("treats an unchanged catalog as equal", () => {
    expect(
      hasSameMcpServerStatuses(
        [
          { name: "context7", status: "connected" },
          { name: "lark-mcp", status: "pending" },
        ],
        [
          { name: "context7", status: "connected" },
          { name: "lark-mcp", status: "pending" },
        ],
      ),
    ).toBe(true);
  });

  it("detects a status transition, a new server, and a removed one", () => {
    const current = [{ name: "context7", status: "pending" }];

    expect(
      hasSameMcpServerStatuses(current, [
        { name: "context7", status: "connected" },
      ]),
    ).toBe(false);
    expect(
      hasSameMcpServerStatuses(current, [
        { name: "context7", status: "pending" },
        { name: "nexus", status: "connected" },
      ]),
    ).toBe(false);
    expect(hasSameMcpServerStatuses(current, [])).toBe(false);
  });
});
