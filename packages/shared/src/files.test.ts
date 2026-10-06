import { describe, expect, it } from "vitest";
import { pathBaseName } from "./files";

describe("pathBaseName", () => {
  it("handles POSIX and Windows separators", () => {
    expect(pathBaseName("/Users/me/repo/src/app.ts")).toBe("app.ts");
    expect(pathBaseName("C:\\Users\\me\\repo\\src\\app.ts")).toBe("app.ts");
    expect(pathBaseName("src/nested\\mixed.ts")).toBe("mixed.ts");
  });

  it("ignores trailing separators on folder paths", () => {
    expect(pathBaseName("C:\\Users\\me\\repo\\")).toBe("repo");
    expect(pathBaseName("/home/me/repo/")).toBe("repo");
  });

  it("returns the input when there is no segment", () => {
    expect(pathBaseName("/")).toBe("/");
    expect(pathBaseName("")).toBe("");
  });
});
