import { describe, expect, it } from "vitest";
import { splitWorkspacePath } from "./workspace-path";

describe("splitWorkspacePath", () => {
  it("splits a POSIX path and compacts the home prefix", () => {
    expect(splitWorkspacePath("/Users/richard/osp/cocurdex/")).toEqual({
      name: "cocurdex",
      parent: "~/osp/",
    });
  });

  it("splits a Windows path", () => {
    expect(splitWorkspacePath("C:\\code\\lody")).toEqual({
      name: "lody",
      parent: "C:\\code\\",
    });
  });

  it("keeps a bare name without a parent", () => {
    expect(splitWorkspacePath("lody")).toEqual({ name: "lody", parent: "" });
  });
});
