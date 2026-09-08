import type { Monaco } from "@monaco-editor/react";
import { shikiToMonaco } from "@shikijs/monaco";
import { createHighlighter } from "shiki";
import { expect, it, vi } from "vitest";
import { configureMonacoHighlighter } from "./monaco-language-loader";

it("loads tokenizers on demand without resetting the theme or stacking editor hooks", async () => {
  const highlighter = await createHighlighter({
    themes: ["github-dark-default", "github-light-default"],
    langs: [],
  });
  const factories = new Map<
    string,
    Parameters<Monaco["languages"]["registerTokensProviderFactory"]>[1]
  >();
  const setTheme = vi.fn();
  const monaco = {
    editor: {
      defineTheme: vi.fn(),
      setTheme,
      create: vi.fn(),
    },
    languages: {
      getLanguages: () => [{ id: "typescript" }, { id: "python" }],
      registerTokensProviderFactory: (
        id: string,
        factory: Parameters<
          Monaco["languages"]["registerTokensProviderFactory"]
        >[1],
      ) => {
        factories.set(id, factory);
        return { dispose: vi.fn() };
      },
    },
  } as unknown as Monaco;

  try {
    const load = configureMonacoHighlighter(
      highlighter,
      monaco,
      ["typescript", "python"],
      shikiToMonaco,
    );
    expect(highlighter.getLoadedLanguages()).toEqual([]);
    monaco.editor.setTheme("github-light-default");
    const setThemeHook = monaco.editor.setTheme;
    const createHook = monaco.editor.create;
    const callsBefore = setTheme.mock.calls.length;

    const provider = await factories.get("typescript")?.create();
    if (!provider || !("tokenize" in provider)) {
      throw new Error("Missing text tokenizer");
    }
    expect(
      provider.tokenize("const answer = 42", provider.getInitialState()).tokens
        .length,
    ).toBeGreaterThan(1);
    expect(highlighter.getLoadedLanguages()).toContain("typescript");
    expect(highlighter.getLoadedLanguages()).not.toContain("python");
    await load("python");

    expect(monaco.editor.setTheme).toBe(setThemeHook);
    expect(monaco.editor.create).toBe(createHook);
    expect(setTheme).toHaveBeenCalledTimes(callsBefore);
    expect(setTheme).toHaveBeenLastCalledWith("github-light-default");
  } finally {
    highlighter.dispose();
  }
});
