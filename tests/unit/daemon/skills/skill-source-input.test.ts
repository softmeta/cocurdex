import { parseSkillSourceInput } from "@cocurdex/daemon/internal/skills/skill-source-input";
import { describe, expect, it } from "vitest";

const posix = { home: "/home/dev", cwd: "/work", platform: "linux" as const };

describe("parseSkillSourceInput", () => {
  it("reads GitHub shorthand with an optional ref and subpath", () => {
    expect(parseSkillSourceInput("anthropics/skills", posix)).toEqual({
      kind: "github",
      owner: "anthropics",
      repo: "skills",
      ref: null,
      subpath: null,
    });
    expect(parseSkillSourceInput("o/r/skills/pdf#v2", posix)).toEqual({
      kind: "github",
      owner: "o",
      repo: "r",
      ref: "v2",
      subpath: "skills/pdf",
    });
  });

  it("reads GitHub tree and blob URLs", () => {
    expect(
      parseSkillSourceInput(
        "https://github.com/o/r/tree/main/skills/pdf",
        posix,
      ),
    ).toMatchObject({ ref: "main", subpath: "skills/pdf" });
    expect(
      parseSkillSourceInput(
        "https://github.com/o/r/blob/dev/skills/pdf/SKILL.md",
        posix,
      ),
    ).toMatchObject({ ref: "dev", subpath: "skills/pdf" });
    expect(
      parseSkillSourceInput("https://github.com/o/r.git", posix),
    ).toMatchObject({
      repo: "r",
    });
  });

  it("resolves local folders per platform", () => {
    expect(parseSkillSourceInput("~/skills", posix)).toEqual({
      kind: "local",
      path: "/home/dev/skills",
    });
    expect(parseSkillSourceInput("./mine", posix)).toEqual({
      kind: "local",
      path: "/work/mine",
    });
    expect(
      parseSkillSourceInput("C:\\Users\\dev\\skills", {
        home: "C:\\Users\\dev",
        cwd: "C:\\work",
        platform: "win32",
      }),
    ).toEqual({ kind: "local", path: "C:\\Users\\dev\\skills" });
  });

  it("rejects other hosts and path traversal", () => {
    expect(() =>
      parseSkillSourceInput("https://gitlab.com/o/r", posix),
    ).toThrow(/Only GitHub/);
    expect(() => parseSkillSourceInput("o/r/../x", posix)).toThrow();
    expect(() => parseSkillSourceInput("just-a-word", posix)).toThrow();
  });
});
