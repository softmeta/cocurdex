import { getWorkspaceDependencyNames } from "@desktop/electron-vite-workspace-dependencies";
import { describe, expect, it } from "vitest";

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
