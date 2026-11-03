import { memoryCloudMode } from "@cocurdex/cli/internal/memory-commands";
import { describe, expect, it } from "vitest";

describe("memoryCloudMode", () => {
  it("maps account actions and their aliases to rsrs modes", () => {
    expect(memoryCloudMode("register")).toBe("register");
    expect(memoryCloudMode("create")).toBe("register");
    expect(memoryCloudMode("signin")).toBe("signin");
    expect(memoryCloudMode("sign-in")).toBe("signin");
    expect(memoryCloudMode("login")).toBe("signin");
  });

  it("rejects an unknown account action with the usage line", () => {
    expect(() => memoryCloudMode("rotate")).toThrow(
      /memory cloud register\|signin/,
    );
  });
});
