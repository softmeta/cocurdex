import {
  getNoteDocSchema,
  parseNoteMarkdown,
  serializeNoteMarkdown,
} from "@cocurdex/note-doc";
import { type Command, EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import {
  focusParagraphAtEnd,
  focusParagraphAtStart,
} from "@/components/markdown-body-editor/boundary-paragraph";

const TABLE = ["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n");

function stateOf(markdown: string): EditorState {
  const schema = getNoteDocSchema();
  return EditorState.create({
    schema,
    doc: schema.nodeFromJSON(parseNoteMarkdown(markdown)),
  });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  expect(
    command(state, (tr) => {
      next = state.apply(tr);
    }),
  ).toBe(true);
  return next;
}

const blockTypes = (state: EditorState) =>
  state.doc.content.content.map((node) => node.type.name);

describe("boundary paragraphs", () => {
  it("adds a paragraph before a leading table and puts the caret in it", () => {
    const next = run(stateOf(TABLE), focusParagraphAtStart);

    expect(blockTypes(next)).toEqual(["paragraph", "table"]);
    expect(next.selection.$from.parent.type.name).toBe("paragraph");
    expect(next.selection.from).toBe(1);
  });

  it("reuses an empty leading paragraph instead of adding another", () => {
    const state = run(stateOf(TABLE), focusParagraphAtStart);
    const next = run(state, focusParagraphAtStart);

    expect(blockTypes(next)).toEqual(["paragraph", "table"]);
  });

  it("adds a paragraph after a trailing table and puts the caret in it", () => {
    const next = run(stateOf(TABLE), focusParagraphAtEnd);

    expect(blockTypes(next)).toEqual(["table", "paragraph"]);
    expect(next.selection.$from.parent.type.name).toBe("paragraph");
    expect(next.selection.from).toBe(next.doc.content.size - 1);
  });

  it("keeps the table intact in Markdown after typing around it", () => {
    const before = run(stateOf(TABLE), focusParagraphAtStart);
    const typed = before.apply(before.tr.insertText("intro"));
    const after = run(typed, focusParagraphAtEnd);
    const done = after.apply(after.tr.insertText("outro"));

    const reparsed = stateOf(serializeNoteMarkdown(done.doc.toJSON()));

    expect(blockTypes(reparsed)).toEqual(["paragraph", "table", "paragraph"]);
    expect(reparsed.doc.firstChild?.textContent).toBe("intro");
    expect(reparsed.doc.lastChild?.textContent).toBe("outro");
  });
});
