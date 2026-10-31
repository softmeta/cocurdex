import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import {
  buildCodeHighlightDecorations,
  type CodeHighlightResult,
} from "./code-highlight-decorations";
import { loadCodeLanguage, tokenizeCode } from "./code-highlighter";

const REFRESH_DELAY_MS = 120;

interface CodeHighlightState extends CodeHighlightResult {
  stale: boolean;
}

const codeHighlightKey = new PluginKey<CodeHighlightState>("codeHighlight");

function highlight(doc: Parameters<typeof buildCodeHighlightDecorations>[0]) {
  return { ...buildCodeHighlightDecorations(doc, tokenizeCode), stale: false };
}

function createCodeHighlightPlugin() {
  return new Plugin<CodeHighlightState>({
    key: codeHighlightKey,
    state: {
      init: (_config, state) => highlight(state.doc),
      apply(tr, value, _previous, next) {
        if (tr.getMeta(codeHighlightKey)) return highlight(next.doc);
        if (!tr.docChanged) return value;
        return {
          ...value,
          decorations: value.decorations.map(tr.mapping, tr.doc),
          stale: true,
        };
      },
    },
    props: {
      decorations: (state): DecorationSet | undefined =>
        codeHighlightKey.getState(state)?.decorations,
    },
    view(view) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let destroyed = false;
      const requested = new Set<string>();
      const refresh = () => {
        timer = null;
        if (destroyed) return;
        view.dispatch(
          view.state.tr
            .setMeta(codeHighlightKey, true)
            .setMeta("addToHistory", false),
        );
      };
      const sync = () => {
        const state = codeHighlightKey.getState(view.state);
        if (!state) return;
        if (state.stale && timer === null) {
          timer = setTimeout(refresh, REFRESH_DELAY_MS);
        }
        for (const language of state.pendingLanguages) {
          if (requested.has(language)) continue;
          requested.add(language);
          void loadCodeLanguage(language).then((loaded) => {
            if (loaded) requested.delete(language);
            if (!destroyed) refresh();
          });
        }
      };
      sync();
      return {
        update: sync,
        destroy() {
          destroyed = true;
          if (timer !== null) clearTimeout(timer);
        },
      };
    },
  });
}

export const CodeHighlight = Extension.create({
  name: "codeHighlight",
  addProseMirrorPlugins() {
    return [createCodeHighlightPlugin()];
  },
});
