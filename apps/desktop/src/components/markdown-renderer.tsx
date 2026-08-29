import type { ReactNode } from "react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { Components } from "streamdown";
import { Streamdown } from "streamdown";
import { isPerfEnabled, logSessionSwitchPerf } from "@/lib";
import { normalizeMarkdownCodeFenceLanguages } from "./markdown-code-fence";
import type { MarkdownFilePathHandlers } from "./markdown-file-path";
import { rewriteMarkdownLocalFileLinks } from "./markdown-file-path";
import type { HeavyPluginKind } from "./markdown-heavy-plugins";
import {
  areHeavyPluginsLoaded,
  getStreamdownPlugins,
  LIGHT_STREAMDOWN_PLUGINS,
  loadHeavyPlugins,
  subscribeStreamdownPlugins,
} from "./markdown-heavy-plugins";
import { createMarkdownComponents } from "./markdown-renderer-components";

export type { MarkdownRendererTone } from "./markdown-renderer-styles";

import type { MarkdownRendererTone } from "./markdown-renderer-styles";

interface MarkdownRendererProps {
  content: string;
  tone?: MarkdownRendererTone;
  className?: string;
  streaming?: boolean;
  perfMessageId?: string;
  perfSessionId?: string;
  // When provided, inline-code tokens that look like existing files become
  // clickable, opening the file in the editor panel.
  filePathHandlers?: MarkdownFilePathHandlers;
}

// Streamdown 2.x ships heavyweight render paths as plugin packages.
// - code: Shiki syntax highlighting for fenced code blocks
// - mermaid: diagram rendering for ```mermaid blocks
// - math: KaTeX rendering
// Those three are loaded on demand — see markdown-heavy-plugins.
// - cjk: critical for a Chinese chat UI — fixes bold/italic that wraps
//   Chinese punctuation and prevents autolinks from swallowing trailing
//   ideographic punctuation. Cheap, so it always ships.
// We do NOT pass rehypePlugins / remarkPlugins overrides: Streamdown's prop
// REPLACES (not merges) the defaults, so overriding would silently disable
// the built-in rehype-sanitize + rehype-harden security layers.

// Per-plugin so a transcript of code fences never pulls in Mermaid. Inline
// code is deliberately absent: `inlineCode` is a core Streamdown component, so
// a lone backtick needs none of these bundles.
function neededHeavyPlugins(content: string): HeavyPluginKind[] {
  const kinds: HeavyPluginKind[] = [];

  if (content.includes("```")) {
    kinds.push("code");
  }

  if (/```[^\S\n]*mermaid\b/.test(content)) {
    kinds.push("mermaid");
  }

  if (
    content.includes("$$") ||
    /\$[^$\n]+\$/.test(content) ||
    content.includes("\\[") ||
    content.includes("\\(")
  ) {
    kinds.push("math");
  }

  return kinds;
}

function isEscaped(content: string, index: number): boolean {
  let backslashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && content[cursor] === "\\") {
    backslashCount += 1;
    cursor -= 1;
  }

  return backslashCount % 2 === 1;
}

function findClosingDollar(content: string, startIndex: number): number {
  for (let index = startIndex; index < content.length; index += 1) {
    if (content[index] === "$" && !isEscaped(content, index)) {
      return index;
    }
  }

  return -1;
}

function normalizeMathBody(content: string): string {
  return content.replace(/\\\$/g, String.raw`\char"24 `);
}

function escapeTextCurrencyDollars(content: string): string {
  let result = "";
  let index = 0;

  while (index < content.length) {
    if (content.startsWith("$$", index) && !isEscaped(content, index)) {
      const closingIndex = content.indexOf("$$", index + 2);

      if (closingIndex === -1) {
        result += content[index];
        index += 1;
        continue;
      }

      result += content.slice(index, closingIndex + 2);
      index = closingIndex + 2;
      continue;
    }

    if (content[index] === "$" && !isEscaped(content, index)) {
      if (/\d/.test(content[index + 1] ?? "")) {
        result += String.raw`\$`;
        index += 1;
        continue;
      }

      const closingIndex = findClosingDollar(content, index + 1);

      if (closingIndex !== -1) {
        result += content.slice(index, closingIndex + 1);
        index = closingIndex + 1;
        continue;
      }
    }

    result += content[index];
    index += 1;
  }

  return result;
}

// Normalize LaTeX-style math delimiters that remark-math does not recognize
// out of the box. Some LLMs emit `\[ ... \]` and `\( ... \)` instead of the
// dollar-sign forms; rewrite them so the math plugin renders them as KaTeX.
// We skip fenced code blocks and inline code spans so genuine source-code
// snippets keep their original characters.
function normalizeMathDelimiters(content: string): string {
  if (
    !content.includes("\\[") &&
    !content.includes("\\(") &&
    !/\$[\d]/.test(content)
  ) {
    return content;
  }

  const segments = content.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return segments
    .map((segment, index) => {
      // Odd indices are the captured code spans/blocks — leave untouched.
      if (index % 2 === 1) {
        return segment;
      }
      const normalizedSegment = segment
        .replace(
          /\\\[([\s\S]+?)\\\]/g,
          (_match, body) => `$$${normalizeMathBody(body)}$$`,
        )
        .replace(
          /\\\(([\s\S]+?)\\\)/g,
          (_match, body) => `$${normalizeMathBody(body)}$`,
        );

      return escapeTextCurrencyDollars(normalizedSegment);
    })
    .join("");
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  tone = "assistant",
  className,
  streaming = false,
  perfMessageId,
  perfSessionId,
  filePathHandlers,
}: MarkdownRendererProps): ReactNode {
  const renderStartedAt = isPerfEnabled() ? performance.now() : 0;
  const components = useMemo<Components>(
    () =>
      createMarkdownComponents(tone, {
        filePath: filePathHandlers,
      }) as Components,
    [tone, filePathHandlers],
  );
  const normalizedContent = useMemo(() => {
    const withCodeFenceLanguages = normalizeMarkdownCodeFenceLanguages(content);
    const withMath = normalizeMathDelimiters(withCodeFenceLanguages);
    // Only rewrite when the chat surface can open files — otherwise the
    // private https://cocurdex.workspace/... URLs would be unclickable.
    return filePathHandlers
      ? rewriteMarkdownLocalFileLinks(withMath)
      : withMath;
  }, [content, filePathHandlers]);
  const neededPlugins = useMemo(
    () => neededHeavyPlugins(normalizedContent),
    [normalizedContent],
  );
  const wantsHeavyPlugins = neededPlugins.length > 0;
  const loadedPlugins = useSyncExternalStore(
    subscribeStreamdownPlugins,
    getStreamdownPlugins,
  );
  const plugins = wantsHeavyPlugins ? loadedPlugins : LIGHT_STREAMDOWN_PLUGINS;

  // Fetching the plugin bundle is external work, and which content needs it is
  // only known once a message has been rendered.
  useEffect(() => {
    if (neededPlugins.length > 0) {
      loadHeavyPlugins(neededPlugins);
    }
  }, [neededPlugins]);

  useLayoutEffect(() => {
    if (!isPerfEnabled() || !perfSessionId) {
      return;
    }

    logSessionSwitchPerf(perfSessionId, "markdown-renderer-commit", {
      contentLength: normalizedContent.length,
      heavyPlugins: wantsHeavyPlugins && areHeavyPluginsLoaded(neededPlugins),
      messageId: perfMessageId ?? null,
      renderToCommitMs: Math.round(performance.now() - renderStartedAt),
      streaming,
      tone,
    });
  }, [
    neededPlugins,
    normalizedContent.length,
    perfMessageId,
    perfSessionId,
    renderStartedAt,
    streaming,
    tone,
    wantsHeavyPlugins,
  ]);

  return (
    <Streamdown
      className={className}
      components={components}
      lineNumbers={false}
      mode={streaming ? "streaming" : "static"}
      parseIncompleteMarkdown={streaming}
      plugins={plugins}
      shikiTheme={["github-light", "github-dark"]}
    >
      {normalizedContent}
    </Streamdown>
  );
});
