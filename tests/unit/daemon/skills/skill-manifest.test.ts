import { parseSkillManifest } from "@cocurdex/daemon/internal/skills/skill-manifest";
import { describe, expect, it } from "vitest";

describe("parseSkillManifest", () => {
  it("accepts a valid manifest with CRLF line endings", () => {
    const manifest = parseSkillManifest(
      "---\r\nname: pdf-tools\r\ndescription: Work with PDFs\r\nlicense: MIT\r\n---\r\nBody",
      "pdf-tools",
    );
    expect(manifest).toEqual({
      name: "pdf-tools",
      description: "Work with PDFs",
      license: "MIT",
      issues: [],
    });
  });

  it("reports spec violations", () => {
    expect(parseSkillManifest("# no frontmatter", "x").issues).toEqual([
      "missingFrontmatter",
    ]);
    expect(
      parseSkillManifest("---\nname: Bad_Name\n---\n", "bad").issues,
    ).toEqual(["invalidName", "missingDescription"]);
    expect(
      parseSkillManifest("---\nname: other\ndescription: d\n---\n", "dir")
        .issues,
    ).toEqual(["nameMismatch"]);
    expect(
      parseSkillManifest(
        `---\nname: ok\ndescription: ${"x".repeat(1025)}\n---\n`,
        "ok",
      ).issues,
    ).toEqual(["descriptionTooLong"]);
  });
});
