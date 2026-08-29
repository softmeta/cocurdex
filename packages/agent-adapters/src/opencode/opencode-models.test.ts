import type { Agent } from "@opencode-ai/sdk/v2";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOpenCodePrimaryAgentNames,
  listOpenCodeProviderModels,
} from "./opencode-models";

const runtimeMocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
}));

vi.mock("./opencode-runtime", async () => {
  const actual =
    await vi.importActual<typeof import("./opencode-runtime")>(
      "./opencode-runtime",
    );
  return {
    ...actual,
    acquireOpenCodeRuntime: runtimeMocks.acquire,
    logOpenCode: vi.fn(),
    releaseOpenCodeRuntime: runtimeMocks.release,
  };
});

describe("OpenCode agent catalog", () => {
  beforeEach(() => {
    runtimeMocks.acquire.mockReset();
    runtimeMocks.release.mockReset();
  });

  it("only exposes visible primary and all-mode agents", () => {
    const agents = [
      { name: "build", hidden: false, mode: "primary" },
      { name: "plan", hidden: false, mode: "primary" },
      { name: "compaction", hidden: true, mode: "all" },
      { name: "summary", hidden: true, mode: "all" },
      { name: "title", hidden: true, mode: "primary" },
      { name: "explore", hidden: false, mode: "subagent" },
    ] as Agent[];

    expect(getOpenCodePrimaryAgentNames(agents)).toEqual(["build", "plan"]);
  });

  it("rejects when the live catalog cannot be loaded", async () => {
    runtimeMocks.acquire.mockRejectedValueOnce(
      new Error("OpenCode server unavailable"),
    );

    await expect(listOpenCodeProviderModels()).rejects.toThrow(
      "OpenCode server unavailable",
    );
    expect(runtimeMocks.release).toHaveBeenCalledWith(null);
  });
});
