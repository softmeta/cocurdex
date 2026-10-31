import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type {
  NoteCodeRequest,
  NoteCodeToken,
} from "../../src/notes/editor/note-editor-protocol";

const CODE_BLOCK_NODE = "codeBlock";
const MAX_CODE_LENGTH = 50_000;
const REFRESH_DELAY_MS = 120;
const CACHE_LIMIT = 200;

interface CodeBlockSource {
  language: string;
  code: string;
}

interface HighlightState {
  decorations: DecorationSet;
  missing: Map<string, CodeBlockSource>;
  stale: boolean;
}

const highlightKey = new PluginKey<HighlightState>("codeHighlight");

function sourceKey({ language, code }: CodeBlockSource) {
  return `${language}\0${code}`;
}

export function createCodeHighlight(
  request: (requests: NoteCodeRequest[]) => void,
) {
  const cache = new Map<string, readonly NoteCodeToken[]>();
  const pending = new Map<number, string>();
  const requested = new Set<string>();
  let nextId = 1;
  let activeView: EditorView | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function build(doc: ProseMirrorNode): HighlightState {
    const decorations: Decoration[] = [];
    const missing = new Map<string, CodeBlockSource>();
    doc.descendants((node, position) => {
      if (node.type.name !== CODE_BLOCK_NODE) return true;
      const source = {
        language: String(node.attrs.language ?? "")
          .trim()
          .toLowerCase(),
        code: node.textContent,
      };
      if (!source.language || !source.code) return false;
      if (source.code.length > MAX_CODE_LENGTH) return false;
      const key = sourceKey(source);
      const tokens = cache.get(key);
      if (!tokens) {
        missing.set(key, source);
        return false;
      }
      const start = position + 1;
      for (const token of tokens) {
        decorations.push(
          Decoration.inline(start + token.from, start + token.to, {
            style: `color:${token.color}`,
          }),
        );
      }
      return false;
    });
    return {
      decorations: DecorationSet.create(doc, decorations),
      missing,
      stale: false,
    };
  }

  function refresh() {
    timer = null;
    activeView?.dispatch(
      activeView.state.tr
        .setMeta(highlightKey, true)
        .setMeta("addToHistory", false),
    );
  }

  function scheduleRefresh() {
    if (timer === null) timer = setTimeout(refresh, REFRESH_DELAY_MS);
  }

  function requestMissing(missing: Map<string, CodeBlockSource>) {
    const requests: NoteCodeRequest[] = [];
    for (const [key, source] of missing) {
      if (requested.has(key)) continue;
      requested.add(key);
      const id = nextId++;
      pending.set(id, key);
      requests.push({ id, ...source });
    }
    if (requests.length > 0) request(requests);
  }

  function remember(key: string, tokens: readonly NoteCodeToken[]) {
    cache.delete(key);
    cache.set(key, tokens);
    for (const stale of [...cache.keys()].slice(0, -CACHE_LIMIT)) {
      cache.delete(stale);
    }
  }

  const extension = Extension.create({
    name: "codeHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin<HighlightState>({
          key: highlightKey,
          state: {
            init: (_config, state) => build(state.doc),
            apply(tr, value, _previous, next) {
              if (tr.getMeta(highlightKey)) return build(next.doc);
              if (!tr.docChanged) return value;
              return {
                ...value,
                decorations: value.decorations.map(tr.mapping, tr.doc),
                stale: true,
              };
            },
          },
          props: {
            decorations: (state) => highlightKey.getState(state)?.decorations,
          },
          view(view) {
            activeView = view;
            const sync = () => {
              const state = highlightKey.getState(view.state);
              if (!state) return;
              if (state.stale) scheduleRefresh();
              requestMissing(state.missing);
            };
            sync();
            return {
              update: sync,
              destroy() {
                activeView = null;
                if (timer !== null) clearTimeout(timer);
              },
            };
          },
        }),
      ];
    },
  });

  return {
    extension,
    receive(id: number, tokens: readonly NoteCodeToken[]) {
      const key = pending.get(id);
      if (key === undefined) return;
      pending.delete(id);
      requested.delete(key);
      remember(key, tokens);
      scheduleRefresh();
    },
    reset() {
      cache.clear();
      pending.clear();
      requested.clear();
      scheduleRefresh();
    },
  };
}
