import { buildNoteDocExtensions } from "@cocurdex/note-doc";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, it } from "vitest";

const SPLIT_LIST =
  "<ul><li><p>a</p></li><li><p>b</p></li></ul><p></p><ul><li><p>c</p></li></ul>";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function open(content: string): Editor {
  editor = new Editor({ extensions: buildNoteDocExtensions(), content });
  return editor;
}

function separatorRange(target: Editor) {
  const doc = target.state.doc;
  const from = doc.child(0).nodeSize;
  return { from, to: from + doc.child(1).nodeSize };
}

const topLevel = (target: Editor) =>
  target.getJSON().content?.map((node) => node.type) ?? [];

describe("adjacent note lists", () => {
  it("merges the lists left behind when the block between them is deleted", () => {
    const target = open(SPLIT_LIST);

    target.commands.deleteRange(separatorRange(target));

    expect(topLevel(target)).toEqual(["bulletList", "paragraph"]);
    expect(target.state.doc.child(0).childCount).toBe(3);
  });

  it("leaves split lists alone when the edit is elsewhere", () => {
    const target = open(`${SPLIT_LIST.replace("<p></p>", "")}<p>tail</p>`);
    const end = target.state.doc.content.size - 1;

    target.chain().setTextSelection(end).insertContent("!").run();

    expect(topLevel(target)).toEqual(["bulletList", "bulletList", "paragraph"]);
  });

  it("merges split lists once an edit touches them", () => {
    const target = open(SPLIT_LIST.replace("<p></p>", ""));

    target.chain().setTextSelection(3).insertContent("!").run();

    expect(topLevel(target)).toEqual(["bulletList", "paragraph"]);
  });

  it("leaves a remote Yjs change for the editing client to merge", () => {
    const target = open(SPLIT_LIST);
    const { from, to } = separatorRange(target);

    target.view.dispatch(
      target.state.tr
        .delete(from, to)
        .setMeta("y-sync$", { isChangeOrigin: true }),
    );

    expect(topLevel(target)).toEqual(["bulletList", "bulletList", "paragraph"]);
  });
});
