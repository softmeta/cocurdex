import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
} from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { findInlineMath, MATH_LANGUAGE, MERMAID_LANGUAGE } from "./math";

export type RenderedLanguage = typeof MATH_LANGUAGE | typeof MERMAID_LANGUAGE;

export function renderedLanguage(language: unknown): RenderedLanguage | null {
  const normalized = String(language ?? "")
    .trim()
    .toLowerCase();
  if (normalized === MATH_LANGUAGE) return MATH_LANGUAGE;
  if (normalized === MERMAID_LANGUAGE) return MERMAID_LANGUAGE;
  return null;
}

export const EDITING_ATTRIBUTE = "data-editing";
export const INLINE_MATH_SOURCE_CLASS = "note-math-source";
export const INLINE_MATH_CLASS = "note-math";

export function hasEditingDecoration(
  decorations: readonly { spec: { editing?: unknown } }[],
) {
  return decorations.some((decoration) => decoration.spec.editing === true);
}

export interface NotePreviewOptions {
  renderInlineMath(tex: string, target: HTMLElement): void;
}

type MathRange = { from: number; to: number; tex: string; key: string };

interface PreviewState {
  focused: boolean;
  ranges: MathRange[];
}

const previewKey = new PluginKey<PreviewState>("notePreviews");
const PLACEHOLDER = " ";

function blockText(block: PMNode) {
  let text = "";
  block.forEach((child) => {
    const literal =
      child.isText && !child.marks.some((mark) => mark.type.spec.code);
    text += literal ? (child.text ?? "") : PLACEHOLDER.repeat(child.nodeSize);
  });
  return text;
}

function mathRanges(doc: PMNode): MathRange[] {
  const ranges: MathRange[] = [];
  const occurrences = new Map<string, number>();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const start = pos + 1;
    for (const { from, to, tex } of findInlineMath(blockText(node))) {
      const occurrence = occurrences.get(tex) ?? 0;
      occurrences.set(tex, occurrence + 1);
      const key = `math:${occurrence}:${tex}`;
      ranges.push({ from: start + from, to: start + to, tex, key });
    }
    return false;
  });
  return ranges;
}

function touches(state: EditorState, from: number, to: number) {
  const { selection } = state;
  return selection.from <= to && selection.to >= from;
}

function editingBlock(state: EditorState) {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent) return null;
  const block = $from.parent;
  if (block.type.name !== "codeBlock") return null;
  if (!renderedLanguage(block.attrs.language)) return null;
  const pos = $from.before();
  return { from: pos, to: pos + block.nodeSize };
}

function placeCaret(view: EditorView, pos: number) {
  const selection = TextSelection.create(view.state.doc, pos);
  view.dispatch(view.state.tr.setSelection(selection));
  view.focus();
}

function mathWidget(
  range: MathRange,
  render: NotePreviewOptions["renderInlineMath"],
) {
  return Decoration.widget(
    range.from,
    (view) => {
      const element = document.createElement("span");
      element.className = INLINE_MATH_CLASS;
      element.contentEditable = "false";
      element.setAttribute("role", "math");
      element.setAttribute("aria-label", range.tex);
      element.addEventListener("mousedown", (event) => {
        if (!view.editable) return;
        event.preventDefault();
        const current = previewKey.getState(view.state);
        const match = current?.ranges.find(
          (candidate) => candidate.key === range.key,
        );
        placeCaret(view, (match ?? range).from + 1);
      });
      render(range.tex, element);
      return element;
    },
    { key: range.key, side: -1, ignoreSelection: true },
  );
}

function decorations(
  state: EditorState,
  render: NotePreviewOptions["renderInlineMath"],
) {
  const pluginState = previewKey.getState(state);
  if (!pluginState) return DecorationSet.empty;
  const editing = pluginState.focused;
  const found: Decoration[] = [];
  for (const range of pluginState.ranges) {
    if (editing && touches(state, range.from, range.to)) continue;
    found.push(
      mathWidget(range, render),
      Decoration.inline(range.from, range.to, {
        class: INLINE_MATH_SOURCE_CLASS,
      }),
    );
  }
  const block = editing ? editingBlock(state) : null;
  if (block) {
    found.push(
      Decoration.node(
        block.from,
        block.to,
        { [EDITING_ATTRIBUTE]: "true" },
        { editing: true },
      ),
    );
  }
  return DecorationSet.create(state.doc, found);
}

export function createNotePreviews({ renderInlineMath }: NotePreviewOptions) {
  return Extension.create({
    name: "notePreviews",
    addProseMirrorPlugins() {
      return [
        new Plugin<PreviewState>({
          key: previewKey,
          state: {
            init: (_config, state) => ({
              focused: false,
              ranges: mathRanges(state.doc),
            }),
            apply(tr, previous) {
              const focused = tr.getMeta(previewKey) ?? previous.focused;
              const ranges = tr.docChanged
                ? mathRanges(tr.doc)
                : previous.ranges;
              if (focused === previous.focused && ranges === previous.ranges) {
                return previous;
              }
              return { focused, ranges };
            },
          },
          props: {
            decorations: (state) => decorations(state, renderInlineMath),
            handleDOMEvents: {
              focus(view) {
                view.dispatch(view.state.tr.setMeta(previewKey, true));
                return false;
              },
              blur(view) {
                view.dispatch(view.state.tr.setMeta(previewKey, false));
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}
