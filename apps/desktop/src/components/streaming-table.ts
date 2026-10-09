const FENCE = /^\s*(```|~~~)/;
const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

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
    TABLE_DELIMITER.test(lines[delimiterIndex]);
  if (hasCompleteDelimiter) {
    return content;
  }
  return lines.slice(0, start).join("\n");
}
