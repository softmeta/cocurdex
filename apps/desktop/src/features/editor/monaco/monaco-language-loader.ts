import type { Monaco } from "@monaco-editor/react";
import type { BundledLanguage, Highlighter } from "shiki";

export function createMonacoLanguageLoader(
  highlighter: Pick<Highlighter, "loadLanguage">,
) {
  const pending = new Map<string, Promise<void>>();

  return (language: BundledLanguage | "plaintext"): Promise<void> => {
    if (language === "plaintext") {
      return Promise.resolve();
    }
    const existing = pending.get(language);
    if (existing) {
      return existing;
    }
    const loading = highlighter
      .loadLanguage(language)
      .catch((error: unknown) => {
        pending.delete(language);
        throw error;
      });
    pending.set(language, loading);
    return loading;
  };
}

export function configureMonacoHighlighter(
  highlighter: Highlighter,
  monaco: Monaco,
  languages: BundledLanguage[],
  bindHighlighter: typeof import("@shikijs/monaco").shikiToMonaco,
) {
  const loadLanguage = createMonacoLanguageLoader(highlighter);
  const lazyHighlighter = {
    ...highlighter,
    getLoadedLanguages: () => languages,
  };
  const lazyMonaco = {
    ...monaco,
    languages: {
      ...monaco.languages,
      setTokensProvider(
        language: string,
        provider: Parameters<Monaco["languages"]["setTokensProvider"]>[1],
      ) {
        return monaco.languages.registerTokensProviderFactory(language, {
          async create() {
            await loadLanguage(language as BundledLanguage);
            return provider;
          },
        });
      },
    },
  };
  bindHighlighter(lazyHighlighter, lazyMonaco);
  return loadLanguage;
}
