import { describe, expect, it } from "vitest";
import { getWorkspaceDependencyNames } from "./electron-vite-workspace-dependencies";

describe("getWorkspaceDependencyNames", () => {
  it("selects every local workspace dependency for bundling", () => {
    expect(
      getWorkspaceDependencyNames({
        "@cocurdex/daemon": "workspace:*",
        "@cocurdex/rpc": "workspace:^",
        "electron-log": "^5.4.3",
      }),
    ).toEqual(["@cocurdex/daemon", "@cocurdex/rpc"]);
  });
});
