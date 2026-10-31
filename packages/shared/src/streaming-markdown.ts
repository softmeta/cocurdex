export const STREAM_RENDER_BATCH_MS = 80;
export const STREAM_TEXT_FADE_MS = 400;

const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER_CELL = /^:?-+:?$/;

function isTableDelimiter(line: string) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  return body
    .split("|")
    .every((cell) => TABLE_DELIMITER_CELL.test(cell.trim()));
}

function isInsideOpenFence(lines: string[]) {
  return lines.filter((line) => FENCE.test(line)).length % 2 === 1;
}

export function hidePendingTableStart(content: string) {
  const lines = content.split("\n");
  const scanEnd = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  let start = scanEnd;
  while (start > 0 && TABLE_ROW.test(lines[start - 1])) {
    start -= 1;
  }
  if (start === scanEnd || isInsideOpenFence(lines.slice(0, start))) {
    return content;
  }
  const delimiterIndex = start + 1;
  const hasCompleteDelimiter =
    delimiterIndex < lines.length - 1 &&
    isTableDelimiter(lines[delimiterIndex]);
  if (hasCompleteDelimiter) {
    return content;
  }
  return lines.slice(0, start).join("\n");
}
