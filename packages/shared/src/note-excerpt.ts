export const NOTE_EXCERPT_SOURCE_LENGTH = 600;
const NOTE_EXCERPT_LENGTH = 160;

const FENCE = /^\s*(`{3,}|~{3,})/;
const SKIPPED_LINE = /^\s*(#{1,6}\s|[-*_]{3,}\s*$|\||<!--|!\[)/;

function plainInline(line: string) {
  return line
    .replace(/^\s*(>\s*)+/, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, "")
    .replace(/!\[([^\][]*)\]\([^()]*\)/g, "$1")
    .replace(/\[([^\][]+)\]\([^()]*\)/g, "$1")
    .replace(
      /\[\[([^\][|]+)(\|([^\][]+))?\]\]/g,
      (_match, target, _alias, alias) => String(alias ?? target),
    )
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function noteExcerpt(markdown: string): string | null {
  let fenced = false;
  const parts: string[] = [];
  let length = 0;
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || SKIPPED_LINE.test(line)) continue;
    const text = plainInline(line);
    if (!text) continue;
    parts.push(text);
    length += text.length + 1;
    if (length >= NOTE_EXCERPT_LENGTH) break;
  }
  const excerpt = parts.join(" ");
  if (!excerpt) return null;
  if (excerpt.length <= NOTE_EXCERPT_LENGTH) return excerpt;
  return `${excerpt.slice(0, NOTE_EXCERPT_LENGTH - 1).trimEnd()}…`;
}
