import { useSyncExternalStore } from "react";
import {
  createNativeEngine,
  isNativeEngineAvailable,
} from "react-native-shiki-engine";
import {
  createHighlighterCore,
  type GrammarState,
  type HighlighterCore,
  type ThemedToken,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { codeFenceLanguage, loadSourceLanguage } from "./source-language";

export type SourceScheme = "light" | "dark";
export type SourceTokens = readonly (readonly ThemedToken[])[];

const THEMES: Record<SourceScheme, string> = {
  light: "github-light-default",
  dark: "github-dark-default",
};
const CHUNK_LINES = 10;
const SLICE_BUDGET_MS = 8;
const PUBLISH_INTERVAL_MS = 100;
const MAX_HIGHLIGHTED_LINES = 20_000;
const MAX_TOKENIZED_LINE_LENGTH = 1_000;
const CACHED_FILES = 8;

let highlighter: Promise<HighlighterCore> | null = null;

function regexEngine() {
  if (isNativeEngineAvailable()) return createNativeEngine();
  return createJavaScriptRegexEngine({ target: "ES2018", forgiving: true });
}

function loadHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: [
      import("shiki/themes/github-light-default.mjs"),
      import("shiki/themes/github-dark-default.mjs"),
    ],
    langs: [],
    engine: regexEngine(),
  }).catch((error: unknown) => {
    highlighter = null;
    throw error;
  });
  return highlighter;
}

function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

interface HighlightStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SourceTokens;
  request(lineCount: number): void;
}

const EMPTY: SourceTokens = [];

function createHighlightStore(
  lines: readonly string[],
  language: string,
  scheme: SourceScheme,
): HighlightStore {
  const listeners = new Set<() => void>();
  const highlighted: (readonly ThemedToken[])[] = [];
  const limit = Math.min(lines.length, MAX_HIGHLIGHTED_LINES);
  let snapshot: SourceTokens = EMPTY;
  let grammarState: GrammarState | undefined;
  let target = 0;
  let running = false;
  let failed = false;
  let publishedAt = 0;

  function publish() {
    if (highlighted.length === snapshot.length) return;
    snapshot = highlighted.slice();
    publishedAt = Date.now();
    for (const listener of [...listeners]) listener();
  }

  function tokenizeChunk(shiki: HighlighterCore) {
    const start = highlighted.length;
    const chunk = lines.slice(start, start + CHUNK_LINES).join("\n");
    const result = shiki.codeToTokens(chunk, {
      lang: language,
      theme: THEMES[scheme],
      grammarState,
      tokenizeMaxLineLength: MAX_TOKENIZED_LINE_LENGTH,
    });
    grammarState = result.grammarState;
    highlighted.push(...result.tokens);
  }

  async function run() {
    const loader = loadSourceLanguage(language);
    if (!loader) {
      failed = true;
      return;
    }
    const shiki = await loadHighlighter();
    await shiki.loadLanguage(loader);
    while (highlighted.length < target && listeners.size > 0) {
      await nextTask();
      const deadline = Date.now() + SLICE_BUDGET_MS;
      while (highlighted.length < target && Date.now() < deadline) {
        tokenizeChunk(shiki);
      }
      const done = highlighted.length >= target;
      if (done || Date.now() - publishedAt >= PUBLISH_INTERVAL_MS) publish();
    }
    publish();
  }

  function resume() {
    if (running || failed || highlighted.length >= target) return;
    running = true;
    void run()
      .catch(() => {
        failed = true;
      })
      .finally(() => {
        running = false;
        if (listeners.size > 0) resume();
      });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      resume();
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    request(lineCount) {
      target = Math.max(target, Math.min(limit, lineCount));
      resume();
    },
  };
}

const stores = new Map<
  string,
  { lines: readonly string[]; store: HighlightStore }
>();

function highlightStore(
  key: string,
  lines: readonly string[],
  language: string,
  scheme: SourceScheme,
) {
  const cacheKey = `${scheme}:${language}:${key}`;
  const cached = stores.get(cacheKey);
  if (cached && cached.lines === lines) return cached.store;
  const store = createHighlightStore(lines, language, scheme);
  stores.delete(cacheKey);
  stores.set(cacheKey, { lines, store });
  for (const stale of [...stores.keys()].slice(0, -CACHED_FILES)) {
    stores.delete(stale);
  }
  return store;
}

const NO_HIGHLIGHT: HighlightStore = {
  subscribe: () => () => {},
  getSnapshot: () => EMPTY,
  request: () => {},
};

export function useSourceTokens(
  key: string,
  lines: readonly string[],
  language: string | null,
  scheme: SourceScheme,
): { tokens: SourceTokens; request(lineCount: number): void } {
  const store = language
    ? highlightStore(key, lines, language, scheme)
    : NO_HIGHLIGHT;
  const tokens = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { tokens, request: store.request };
}

export interface CodeToken {
  from: number;
  to: number;
  color: string;
}

export async function highlightCode(
  code: string,
  fence: string,
  scheme: SourceScheme,
): Promise<CodeToken[]> {
  const language = codeFenceLanguage(fence);
  const loader = language ? loadSourceLanguage(language) : null;
  if (!language || !loader) return [];
  const shiki = await loadHighlighter();
  await shiki.loadLanguage(loader);
  await nextTask();
  const lines = shiki.codeToTokens(code, {
    lang: language,
    theme: THEMES[scheme],
    tokenizeMaxLineLength: MAX_TOKENIZED_LINE_LENGTH,
  }).tokens;
  return lines.flat().flatMap((token) =>
    token.color && token.content.length > 0
      ? [
          {
            from: token.offset,
            to: token.offset + token.content.length,
            color: token.color,
          },
        ]
      : [],
  );
}
