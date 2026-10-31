import { findDocImages } from "@cocurdex/shared";
import type { MarkdownSegment } from "./markdown-segments";

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function closesFence(line: string, fence: string) {
  const trimmed = line.trim();
  return (
    trimmed.length >= fence.length &&
    [...trimmed].every((character) => character === fence[0])
  );
}

function splitProse(
  segment: Extract<MarkdownSegment, { kind: "markdown" }>,
): MarkdownSegment[] {
  const lines = segment.text.split(/\r?\n/);
  const output: MarkdownSegment[] = [];
  let prose: string[] = [];
  let proseLine = segment.line;
  let proseColumn = 0;
  let fence: string | null = null;
  const flush = (nextLine: number, nextColumn: number) => {
    const text = prose.join("\n");
    if (text.trim() !== "") {
      output.push({
        kind: "markdown",
        line: proseLine,
        ...(proseColumn > 0 ? { column: proseColumn } : {}),
        text,
      });
    }
    prose = [];
    proseLine = nextLine;
    proseColumn = nextColumn;
  };
  lines.forEach((line, index) => {
    const lineNumber = segment.line + index;
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      prose.push(line);
      return;
    }
    fence = FENCE.exec(line)?.[1] ?? null;
    const images = fence ? [] : findDocImages(line);
    if (images.length === 0) {
      prose.push(line);
      return;
    }
    let cursor = 0;
    for (const image of images) {
      const before = line.slice(cursor, image.index);
      if (before !== "") prose.push(before);
      flush(lineNumber, image.index + image.length);
      output.push({
        kind: "image",
        line: lineNumber,
        column: image.index,
        fileName: image.fileName,
        alt: image.alt,
      });
      cursor = image.index + image.length;
    }
    const rest = line.slice(cursor);
    if (rest.trim() === "") {
      flush(lineNumber + 1, 0);
    } else {
      prose.push(rest);
    }
  });
  flush(segment.line + lines.length, 0);
  return output;
}

export function splitDocImages(
  segments: readonly MarkdownSegment[],
): MarkdownSegment[] {
  return segments.flatMap((segment) =>
    segment.kind === "markdown" ? splitProse(segment) : [segment],
  );
}
