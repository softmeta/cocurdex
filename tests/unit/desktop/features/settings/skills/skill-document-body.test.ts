import { describe, expect, it } from "vitest";
import { skillDocumentBody } from "@/features/settings/skills/skill-library-model";

describe("skillDocumentBody", () => {
  it("drops the YAML frontmatter and leading blank lines", () => {
    const content =
      "---\nname: demo\ndescription: Demo skill\n---\n\n# Demo\n\nBody";
    expect(skillDocumentBody(content)).toBe("# Demo\n\nBody");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nname: demo\r\n---\r\n\r\n# Demo\r\n";
    expect(skillDocumentBody(content)).toBe("# Demo\r\n");
  });

  it("keeps content without frontmatter", () => {
    expect(skillDocumentBody("# Demo\n---\nmore")).toBe("# Demo\n---\nmore");
  });

  it("keeps content whose frontmatter never closes", () => {
    const content = "---\nname: demo\n# Demo";
    expect(skillDocumentBody(content)).toBe(content);
  });
});
