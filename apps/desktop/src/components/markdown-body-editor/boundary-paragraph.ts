import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  type Command,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";

function isEmptyParagraph(node: ProseMirrorNode | null): boolean {
  return node?.type.name === "paragraph" && node.content.size === 0;
}

function placeCaretInParagraphAt(pos: number, insert: boolean): Command {
  return (state, dispatch) => {
    const paragraph = state.schema.nodes.paragraph;
    if (!paragraph) return false;
    if (dispatch) {
      const tr = insert ? state.tr.insert(pos, paragraph.create()) : state.tr;
      tr.setSelection(TextSelection.create(tr.doc, pos + 1));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
}

export const focusParagraphAtStart: Command = (state, dispatch) =>
  placeCaretInParagraphAt(0, !isEmptyParagraph(state.doc.firstChild))(
    state,
    dispatch,
  );

export const focusParagraphAtEnd: Command = (state, dispatch) => {
  const { doc } = state;
  const last = doc.lastChild;
  if (isEmptyParagraph(last) && last) {
    return placeCaretInParagraphAt(doc.content.size - last.nodeSize, false)(
      state,
      dispatch,
    );
  }
  return placeCaretInParagraphAt(doc.content.size, true)(state, dispatch);
};

export const BoundaryParagraph = Extension.create({
  name: "boundaryParagraph",
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("boundaryParagraph"),
        props: {
          handleClick: (view, _pos, event) => {
            const { doc } = view.state;
            const last = doc.lastChild;
            if (!last || last.isTextblock) return false;
            const dom = view.nodeDOM(doc.content.size - last.nodeSize);
            if (!(dom instanceof HTMLElement)) return false;
            if (event.clientY <= dom.getBoundingClientRect().bottom) {
              return false;
            }
            return focusParagraphAtEnd(view.state, view.dispatch);
          },
        },
      }),
    ];
  },
});
