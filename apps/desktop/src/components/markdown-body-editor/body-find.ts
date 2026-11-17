import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export interface TextMatch {
  from: number;
  to: number;
}

export interface BodyFindState {
  query: string;
  matches: TextMatch[];
  current: number;
  decorations: DecorationSet;
}

interface BodyFindMeta {
  query?: string;
  current?: number;
}

const LEAF_PLACEHOLDER = "￼";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findTextMatches(
  doc: ProseMirrorNode,
  query: string,
): TextMatch[] {
  if (!query) return [];
  const pattern = new RegExp(escapeRegExp(query), "giu");
  const matches: TextMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(
      0,
      node.content.size,
      undefined,
      LEAF_PLACEHOLDER,
    );
    const contentStart = pos + 1;
    for (const match of text.matchAll(pattern)) {
      const from = contentStart + match.index;
      matches.push({ from, to: from + match[0].length });
    }
    return false;
  });
  return matches;
}

function buildDecorations(
  doc: ProseMirrorNode,
  matches: TextMatch[],
  current: number,
): DecorationSet {
  return DecorationSet.create(
    doc,
    matches.map((match, index) =>
      Decoration.inline(match.from, match.to, {
        class:
          index === current
            ? "rounded-micro bg-status-warning/80 text-foreground"
            : "rounded-micro bg-status-warning/30",
        ...(index === current ? { "data-find-current": "" } : {}),
      }),
    ),
  );
}

const EMPTY_STATE: BodyFindState = {
  query: "",
  matches: [],
  current: 0,
  decorations: DecorationSet.empty,
};

export const bodyFindKey = new PluginKey<BodyFindState>("bodyFind");

export function readBodyFind(state: EditorState): BodyFindState {
  return bodyFindKey.getState(state) ?? EMPTY_STATE;
}

export function setBodyFind(view: EditorView, meta: BodyFindMeta) {
  view.dispatch(view.state.tr.setMeta(bodyFindKey, meta));
}

export const BodyFind = Extension.create({
  name: "bodyFind",
  addProseMirrorPlugins() {
    return [
      new Plugin<BodyFindState>({
        key: bodyFindKey,
        state: {
          init: () => EMPTY_STATE,
          apply(tr, previous) {
            const meta = tr.getMeta(bodyFindKey) as BodyFindMeta | undefined;
            const queryChanged =
              meta?.query !== undefined && meta.query !== previous.query;
            if (
              !queryChanged &&
              !tr.docChanged &&
              meta?.current === undefined
            ) {
              return previous;
            }
            const query = meta?.query ?? previous.query;
            const matches =
              queryChanged || tr.docChanged
                ? findTextMatches(tr.doc, query)
                : previous.matches;
            const wanted =
              meta?.current ?? (queryChanged ? 0 : previous.current);
            const current =
              matches.length === 0
                ? 0
                : ((wanted % matches.length) + matches.length) % matches.length;
            return {
              query,
              matches,
              current,
              decorations: buildDecorations(tr.doc, matches, current),
            };
          },
        },
        props: {
          decorations: (state) => bodyFindKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
