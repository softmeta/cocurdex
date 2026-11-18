import { Extension } from "@tiptap/core";

export const MATH_LANGUAGE = "math";
export const MERMAID_LANGUAGE = "mermaid";

export type InlineMath = { from: number; to: number; tex: string };

const WHITESPACE = /\s/;
const DIGIT = /\d/;
const DISPLAY_MATH = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n+|$)/;

function escaped(text: string, index: number) {
  let backslashes = 0;
  for (let at = index - 1; at >= 0 && text[at] === "\\"; at -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function singleDollar(text: string, index: number) {
  return (
    text[index] === "$" &&
    text[index - 1] !== "$" &&
    text[index + 1] !== "$" &&
    !escaped(text, index)
  );
}

function opens(text: string, index: number) {
  const next = text[index + 1];
  return (
    singleDollar(text, index) && next !== undefined && !WHITESPACE.test(next)
  );
}

function closes(text: string, index: number) {
  const previous = text[index - 1];
  const next = text[index + 1];
  return (
    singleDollar(text, index) &&
    previous !== undefined &&
    !WHITESPACE.test(previous) &&
    (next === undefined || !DIGIT.test(next))
  );
}

function closingIndex(text: string, open: number) {
  for (let at = open + 2; at < text.length; at += 1) {
    if (closes(text, at)) return at;
  }
  return -1;
}

/**
 * Pandoc's `tex_math_dollars` rule: the opening `$` is followed by a
 * non-space, the closing `$` follows a non-space and precedes no digit, so
 * prices such as "$5 and $10" stay text.
 */
export function findInlineMath(text: string): InlineMath[] {
  const found: InlineMath[] = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("$", at);
    if (open < 0) break;
    const close = opens(text, open) ? closingIndex(text, open) : -1;
    if (close < 0) {
      at = open + 1;
      continue;
    }
    found.push({ from: open, to: close + 1, tex: text.slice(open + 1, close) });
    at = close + 1;
  }
  return found;
}

const CODE = /(^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\2[^\n]*$|`[^`\n]*`)/gmu;
const MARKDOWN_ESCAPE = /\\([\\`*_[\]~])/g;
const HTML_ENTITY = /&(amp|lt|gt);/g;
const ENTITY_TEXT: Record<string, string> = { amp: "&", lt: "<", gt: ">" };

function literalTex(tex: string) {
  return tex
    .replace(MARKDOWN_ESCAPE, "$1")
    .replace(HTML_ENTITY, (_match, name: string) => ENTITY_TEXT[name] ?? "");
}

function restoreMathIn(text: string) {
  let restored = "";
  let at = 0;
  for (const { from, to, tex } of findInlineMath(text)) {
    restored += `${text.slice(at, from)}$${literalTex(tex)}$`;
    at = to;
  }
  return restored + text.slice(at);
}

/** Undoes the serializer's text escaping inside `$…$`, which TeX reads verbatim. */
export function restoreInlineMath(markdown: string) {
  let restored = "";
  let at = 0;
  for (const match of markdown.matchAll(CODE)) {
    restored += restoreMathIn(markdown.slice(at, match.index)) + match[0];
    at = match.index + match[0].length;
  }
  return restored + restoreMathIn(markdown.slice(at));
}

export const MathMarkdown = Extension.create({
  name: "mathMarkdown",
  markdownTokenName: "mathBlock",
  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start: (src) => src.indexOf("$$"),
    tokenize(src) {
      const match = DISPLAY_MATH.exec(src);
      const tex = match?.[1]?.trim();
      if (!match || !tex) return undefined;
      return { type: "mathBlock", raw: match[0], text: tex };
    },
  },
  parseMarkdown: (token, helpers) =>
    helpers.createNode("codeBlock", { language: MATH_LANGUAGE }, [
      helpers.createTextNode(token.text ?? ""),
    ]),
});

/** Keeps `$…$` literal so TeX such as `x_i y_j` never becomes emphasis. */
export const InlineMathMarkdown = Extension.create({
  name: "inlineMathMarkdown",
  markdownTokenName: "inlineMath",
  markdownTokenizer: {
    name: "inlineMath",
    level: "inline",
    start: (src) => src.indexOf("$"),
    tokenize(src) {
      const [first] = findInlineMath(src);
      if (first?.from !== 0) return undefined;
      return {
        type: "inlineMath",
        raw: src.slice(0, first.to),
        text: first.tex,
      };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createTextNode(token.raw ?? ""),
});
