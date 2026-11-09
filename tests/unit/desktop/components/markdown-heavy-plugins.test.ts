import { describe, expect, it } from "vitest";
import { getStreamdownPlugins } from "@/components/markdown-heavy-plugins";

describe("getStreamdownPlugins", () => {
  it("returns a stable reference across calls", () => {
    expect(getStreamdownPlugins()).toBe(getStreamdownPlugins());
  });
});
