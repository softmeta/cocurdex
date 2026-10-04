import { describe, expect, it } from "vitest";
import { renderPiWorkspaceRootsPrompt } from "./pi-workspace-roots";

describe("renderPiWorkspaceRootsPrompt", () => {
  it("returns null for a single-folder workspace", () => {
    expect(renderPiWorkspaceRootsPrompt("/a", ["/a"])).toBeNull();
    expect(renderPiWorkspaceRootsPrompt("/a")).toBeNull();
  });

  it("lists every other folder once", () => {
    const prompt = renderPiWorkspaceRootsPrompt("/a", ["/a", "/b", "/c", "/b"]);
    expect(prompt).toContain("- /a (primary, working directory)");
    expect(prompt?.match(/- \/b$/gm)).toHaveLength(1);
    expect(prompt).toContain("- /c");
  });
});
