export type MarkdownBlock = { line: number; text: string };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;
const LIST_MARKER_START = /^ {0,3}(?:[-*+]|\d)/;
const BLANK = /^[ \t]*$/;

function closesFence(line: string, fence: string) {
  const trimmed = line.trim();
  return (
    trimmed.length >= fence.length &&
    [...trimmed].every((character) => character === fence[0])
  );
}

function startsNewBlock(line: string, inList: boolean) {
  if (line === "" || /^[ \t]/.test(line)) return false;
  return !(inList && LIST_MARKER_START.test(line));
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let start = 0;
  let fence: string | null = null;
  let inList = false;
  let afterBlank = false;
  const flush = (end: number) => {
    const text = lines.slice(start, end).join("\n");
    if (!BLANK.test(text)) blocks.push({ line: start, text });
    start = end;
  };
  lines.forEach((line, index) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      return;
    }
    if (BLANK.test(line)) {
      afterBlank = index > start;
      return;
    }
    if (afterBlank && startsNewBlock(line, inList)) {
      flush(index);
      inList = false;
    }
    afterBlank = false;
    if (index === start || !inList) inList = LIST_ITEM.test(line);
    fence = FENCE.exec(line)?.[1] ?? null;
  });
  flush(lines.length);
  return blocks;
}
