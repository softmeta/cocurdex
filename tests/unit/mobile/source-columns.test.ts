import {
  expandTabs,
  sourceColumns,
} from "@cocurdex/mobile/internal/files/source-columns";
import { describe, expect, it } from "vitest";

describe("source columns", () => {
  it("expands each tab to two spaces so indentation stays visible", () => {
    expect(expandTabs("\t\treturn;")).toBe("    return;");
    expect(expandTabs("plain")).toBe("plain");
  });

  it("measures the widest line after expanding tabs", () => {
    expect(sourceColumns(["abc", "\t\tab", ""])).toBe(6);
    expect(sourceColumns([])).toBe(0);
  });
});
