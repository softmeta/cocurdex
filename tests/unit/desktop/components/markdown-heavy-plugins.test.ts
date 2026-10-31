import { describe, expect, it } from "vitest";
import { getStreamdownPlugins } from "@/components/markdown-heavy-plugins";

describe("getStreamdownPlugins", () => {
  // useSyncExternalStore treats a new object as a new value, so an unstable
  // snapshot renders forever (React error #185).
  it("returns a stable reference across calls", () => {
    expect(getStreamdownPlugins()).toBe(getStreamdownPlugins());
  });
});
