import { describe, expect, it } from "vitest";
import source from "../../../src/features/editor/editor-breadcrumb-dir-tree.tsx?raw";

describe("BreadcrumbDirTree", () => {
  it("does not call useEffect directly", () => {
    expect(source).not.toMatch(/\buseEffect\s*\(/);
  });
});
