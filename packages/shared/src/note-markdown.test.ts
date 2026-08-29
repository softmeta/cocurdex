import { describe, expect, it } from "vitest";
import {
  noteFilenameFromTitle,
  noteFolderNameFromTitle,
  parentIdFromNoteId,
  parseNoteMarkdown,
  serializeNoteMarkdown,
  titleFromNoteId,
} from "./note-markdown";

describe("parseNoteMarkdown", () => {
  it("returns body only when frontmatter is absent", () => {
    const parsed = parseNoteMarkdown("# Hello\n\nWorld\n");
    expect(parsed.frontmatter).toEqual({});
    expect(parsed.body).toBe("# Hello\n\nWorld\n");
  });

  it("parses title and icon frontmatter", () => {
    const raw = `---
title: Permissions
icon: shield
---

# Body
`;
    const parsed = parseNoteMarkdown(raw);
    expect(parsed.frontmatter).toEqual({
      title: "Permissions",
      icon: "shield",
    });
    expect(parsed.body).toBe("# Body\n");
  });

  it("handles quoted title values", () => {
    const raw = `---
title: "A: B"
---

x
`;
    expect(parseNoteMarkdown(raw).frontmatter.title).toBe("A: B");
  });
});

describe("serializeNoteMarkdown", () => {
  it("omits frontmatter when empty", () => {
    expect(serializeNoteMarkdown({}, "hello")).toBe("hello\n");
  });

  it("round-trips title and body", () => {
    const raw = serializeNoteMarkdown({ title: "Hi", icon: "x" }, "Body text");
    const parsed = parseNoteMarkdown(raw);
    expect(parsed.frontmatter.title).toBe("Hi");
    expect(parsed.frontmatter.icon).toBe("x");
    expect(parsed.body.trim()).toBe("Body text");
  });
});

describe("path helpers", () => {
  it("slugs titles into filenames", () => {
    expect(noteFilenameFromTitle("Hello World!")).toBe("hello-world.md");
    expect(noteFilenameFromTitle("  ")).toBe("untitled.md");
    expect(noteFolderNameFromTitle("Design Notes")).toBe("design-notes");
  });

  it("keeps CJK and mixed-script titles in filenames", () => {
    expect(noteFilenameFromTitle("实现登录")).toBe("实现登录.md");
    expect(noteFilenameFromTitle("看板：中文 Title!")).toBe(
      "看板-中文-title.md",
    );
    expect(noteFilenameFromTitle("Café 笔记")).toBe("cafe-笔记.md");
  });

  it("derives parent and title from id", () => {
    expect(parentIdFromNoteId("a.md")).toBeNull();
    expect(parentIdFromNoteId("design/a.md")).toBe("design");
    expect(titleFromNoteId("design/permissions.md")).toBe("permissions");
  });
});
