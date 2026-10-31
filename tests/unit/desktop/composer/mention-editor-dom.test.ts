import { afterEach, describe, expect, it } from "vitest";
import {
  hydrateEditorContent,
  MENTION_KEY_ATTR,
  pillElementFromAttachment,
  serializeEditor,
  serializeEditorContent,
} from "@/features/composer/mention-editor-dom";

const mention = {
  contentOmitted: true,
  endLine: 1,
  filePath: "/ws/src/a.ts",
  kind: "context-file" as const,
  language: "typescript",
  selectedText: "",
  startLine: 1,
  surroundingContext: "",
};

const mountedEditors: HTMLDivElement[] = [];

function mountEditor() {
  const editor = document.createElement("div");
  document.body.appendChild(editor);
  mountedEditors.push(editor);
  return editor;
}

afterEach(() => {
  for (const editor of mountedEditors) {
    editor.remove();
  }
  mountedEditors.length = 0;
});

describe("serializeEditorContent", () => {
  it("round-trips mixed text and mention pills", () => {
    const editor = mountEditor();
    editor.appendChild(document.createTextNode("see "));
    editor.appendChild(
      pillElementFromAttachment(mention, "a.ts", "@src/a.ts", "Remove"),
    );
    editor.appendChild(document.createTextNode(" please"));

    const nodes = serializeEditorContent(editor);
    expect(nodes).toEqual([
      { type: "text", value: "see " },
      {
        displayLabel: "a.ts",
        key: "file:/ws/src/a.ts:1:1",
        serializedText: "@src/a.ts",
        type: "mention",
      },
      { type: "text", value: " please" },
    ]);
    expect(serializeEditor(editor)).toEqual({
      mentionKeys: ["file:/ws/src/a.ts:1:1"],
      nodes,
      text: "see @src/a.ts please",
    });

    const restored = mountEditor();
    const restoredMentions = hydrateEditorContent(
      restored,
      nodes,
      [mention],
      "Remove",
    );
    expect(restoredMentions).toEqual([mention]);
    expect(serializeEditorContent(restored)).toEqual(nodes);
    expect(restored.querySelector(`[${MENTION_KEY_ATTR}]`)).not.toBeNull();
  });

  it("keeps a newline between a mention and the next block line", () => {
    const editor = mountEditor();
    const firstLine = document.createElement("div");
    firstLine.appendChild(document.createTextNode("see "));
    firstLine.appendChild(
      pillElementFromAttachment(mention, "a.ts", "@src/a.ts", "Remove"),
    );
    const secondLine = document.createElement("div");
    secondLine.appendChild(document.createTextNode("next"));
    editor.appendChild(firstLine);
    editor.appendChild(secondLine);

    expect(serializeEditor(editor).text).toBe("see @src/a.ts\nnext");
  });
});
