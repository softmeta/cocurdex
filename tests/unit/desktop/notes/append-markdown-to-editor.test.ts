import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import { appendMarkdownToEditor } from "@/features/notes/append-markdown-to-editor";

function mockEditor(options: {
  isDestroyed?: boolean;
  existingMarkdown?: string;
  setContentOk?: boolean;
  afterMarkdown?: string;
}): Editor {
  let markdown = options.existingMarkdown ?? "";
  return {
    isDestroyed: options.isDestroyed ?? false,
    getMarkdown: () => markdown,
    commands: {
      setContent: vi.fn((next: string) => {
        if (options.setContentOk === false) {
          return false;
        }
        markdown = options.afterMarkdown ?? next;
        return true;
      }),
    },
  } as unknown as Editor;
}

describe("appendMarkdownToEditor", () => {
  it("writes the first clip into an empty editor", () => {
    const editor = mockEditor({});
    const clip =
      "hello world\n\n— [a.pdf · p.1](cocurdex-pdf://open?path=%2Fa.pdf&page=1)";
    expect(appendMarkdownToEditor(editor, clip)).toBe(true);
    expect(editor.commands.setContent).toHaveBeenCalledWith(clip, {
      contentType: "markdown",
    });
  });

  it("appends a second clip after existing markdown", () => {
    const first = "first clip";
    const second =
      "second clip\n\n— [a.pdf · p.2](cocurdex-pdf://open?path=%2Fa.pdf&page=2)";
    const editor = mockEditor({ existingMarkdown: `${first}\n` });
    expect(appendMarkdownToEditor(editor, second)).toBe(true);
    expect(editor.commands.setContent).toHaveBeenCalledWith(
      `${first}\n\n${second}`,
      { contentType: "markdown" },
    );
  });

  it("returns false when the editor is destroyed", () => {
    const editor = mockEditor({ isDestroyed: true });
    expect(appendMarkdownToEditor(editor, "x")).toBe(false);
  });

  it("returns false when setContent reports success but content is missing", () => {
    const editor = mockEditor({
      existingMarkdown: "keep",
      // Simulate a silent no-op: setContent "succeeds" but markdown unchanged.
      afterMarkdown: "keep",
    });
    expect(appendMarkdownToEditor(editor, "brand new text")).toBe(false);
  });
});
