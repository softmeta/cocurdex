import { describe, expect, it } from "vitest";
import { getNextRevealLength } from "./streaming-reveal";

describe("getNextRevealLength", () => {
  it("reveals a small backlog at the minimum pace", () => {
    expect(getNextRevealLength("a".repeat(20), 0, 50)).toBe(5);
  });

  it("caps a fast stream at a comfortable reading pace", () => {
    expect(getNextRevealLength("a".repeat(600), 0, 50)).toBe(13);
  });

  it("speeds up once the backlog would lag behind too far", () => {
    expect(getNextRevealLength("a".repeat(1_500), 0, 50)).toBe(25);
  });

  it("never passes the end of the content", () => {
    expect(getNextRevealLength("abc", 2, 1_000)).toBe(3);
  });

  it("does not split a surrogate pair", () => {
    expect(getNextRevealLength("a😀b", 0, 22)).toBe(3);
  });
});
